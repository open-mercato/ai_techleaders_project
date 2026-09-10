import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { createWriteStream, type WriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';
import {
  closeAgentBrowser,
  integrationArtifactsDirectory,
} from './agent-browser';
import { integrationChildEnvironment } from './environment';

const execFileAsync = promisify(execFile);
const root = process.cwd();
const npmExecutable = process.platform === 'win32' ? 'npm.cmd' : 'npm';

let postgres: StartedPostgreSqlContainer | undefined;
let app: ChildProcess | undefined;
let appLog: WriteStream | undefined;
let appStartError: Error | undefined;

declare module 'vitest' {
  export interface ProvidedContext {
    integrationBaseUrl: string;
    homeBrowserSession: string;
    adminBrowserSession: string;
  }
}

async function runNpm(args: string[], environment: NodeJS.ProcessEnv): Promise<void> {
  await execFileAsync(npmExecutable, args, {
    cwd: root,
    env: environment,
    maxBuffer: 20 * 1024 * 1024,
    timeout: 180_000,
  });
}

async function availablePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('Unable to reserve an application port'));
        return;
      }
      server.close((error) => {
        if (error) reject(error);
        else resolvePort(address.port);
      });
    });
  });
}

async function waitForReady(baseUrl: string): Promise<void> {
  const deadline = Date.now() + 60_000;
  let lastFailure = 'the app did not answer';

  while (Date.now() < deadline) {
    if (appStartError) {
      throw new Error(`Next.js could not start: ${appStartError.message}`);
    }
    if (app?.exitCode !== null || app?.signalCode !== null) {
      throw new Error(
        `Next.js exited before readiness (code ${String(app?.exitCode)}, signal ${String(app?.signalCode)})`,
      );
    }

    try {
      const response = await fetch(`${baseUrl}/api/health`);
      const health = (await response.json()) as { status?: string; database?: string };
      if (response.ok && health.status === 'ok' && health.database === 'up') {
        return;
      }
      lastFailure = `health returned ${response.status} with database=${String(health.database)}`;
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
    }

    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500));
  }

  throw new Error(`Timed out waiting for the integration app: ${lastFailure}`);
}

async function stopApp(): Promise<void> {
  if (
    !app ||
    app.exitCode !== null ||
    app.signalCode !== null ||
    app.pid === undefined
  ) {
    appLog?.end();
    return;
  }

  const exited = new Promise<void>((resolveExit) => app?.once('exit', () => resolveExit()));
  if (process.platform === 'win32') {
    app.kill('SIGTERM');
  } else {
    try {
      process.kill(-app.pid, 'SIGTERM');
    } catch {
      app.kill('SIGTERM');
    }
  }

  await Promise.race([
    exited,
    new Promise((resolveDelay) => setTimeout(resolveDelay, 5_000)),
  ]);

  if (app.exitCode === null && app.signalCode === null) {
    if (process.platform === 'win32') {
      app.kill('SIGKILL');
    } else {
      try {
        process.kill(-app.pid, 'SIGKILL');
      } catch {
        app.kill('SIGKILL');
      }
    }
    await exited;
  }
  appLog?.end();
}

async function cleanup(homeSession: string, adminSession: string): Promise<void> {
  await Promise.all([
    closeAgentBrowser(homeSession),
    closeAgentBrowser(adminSession),
  ]);
  await stopApp();
  if (postgres) {
    await postgres.stop();
    postgres = undefined;
  }
}

export default async function setup(project: TestProject) {
  const runId = `${Date.now()}-${process.pid}`;
  const homeSession = `devmentor-home-${runId}`;
  const adminSession = `devmentor-admin-${runId}`;

  try {
    await mkdir(integrationArtifactsDirectory, { recursive: true });
    postgres = await new PostgreSqlContainer('postgres:17-alpine')
      .withDatabase('devmentor_test')
      .withUsername('devmentor')
      .withPassword('devmentor')
      .start();

    // The port is reserved **before** the child environment is built, because `APP_URL` is
    // part of that environment and the app resolves its own OAuth callback against it. The
    // reservation is a hint rather than a lock — `availablePort` closes the probe socket so
    // the app can bind it — and this order widens the gap between reserving and binding to
    // include migrate, seed and build. That is acceptable here: the suite owns its machine
    // for the duration, runs `fileParallelism: false`, and the alternative (two divergent
    // environments, one for the build and one for the app) is a worse failure mode than a
    // port collision, which fails loudly at startup.
    const port = await availablePort();
    const baseUrl = `http://127.0.0.1:${port}`;

    const environment = integrationChildEnvironment(postgres.getConnectionUri(), baseUrl);
    await runNpm(['run', 'db:migrate'], environment);
    await runNpm(['run', 'db:seed'], environment);
    // Seed a second time on purpose. `npm run setup` re-seeds on every invocation, so
    // a non-idempotent seeder would break it — `users.email` is unique, and the old
    // seeder raised a unique violation here. Failing in setup makes that regression
    // impossible to miss.
    await runNpm(['run', 'db:seed'], environment);
    await runNpm(['run', 'build'], environment);

    appLog = createWriteStream(resolve(integrationArtifactsDirectory, 'app.log'), {
      flags: 'w',
    });
    app = spawn(
      npmExecutable,
      [
        'run',
        'start',
        '--workspace',
        '@devmentor/app',
        '--',
        '--hostname',
        '127.0.0.1',
        '--port',
        String(port),
      ],
      {
        cwd: root,
        env: environment,
        detached: process.platform !== 'win32',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    app.once('error', (error) => {
      appStartError = error;
      appLog?.write(`\nFailed to start Next.js: ${error.stack ?? error.message}\n`);
    });
    app.stdout?.pipe(appLog);
    app.stderr?.pipe(appLog);

    await waitForReady(baseUrl);
    project.provide('integrationBaseUrl', baseUrl);
    project.provide('homeBrowserSession', homeSession);
    project.provide('adminBrowserSession', adminSession);

    return () => cleanup(homeSession, adminSession);
  } catch (error) {
    await cleanup(homeSession, adminSession);
    throw error;
  }
}
