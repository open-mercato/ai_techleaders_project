import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import type { TestProject } from "vitest/node";

const execFileAsync = promisify(execFile);

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const bin = (name: string) => fileURLToPath(
  new URL(`../../node_modules/.bin/${name}`, import.meta.url),
);

const POSTGRES_IMAGE = process.env.TEST_POSTGRES_IMAGE ?? "postgres:17-alpine";
const READY_TIMEOUT_MS = 90_000;

let container: StartedPostgreSqlContainer | undefined;
let server: ChildProcessWithoutNullStreams | undefined;
let serverLog = "";

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.unref();
    probe.on("error", reject);
    // Port 0 lets the OS pick a free port; we grab it and immediately release.
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      if (typeof address === "string" || address === null) {
        probe.close(() => reject(new Error("could not determine a free port")));
        return;
      }
      const { port } = address;
      probe.close(() => resolve(port));
    });
  });
}

async function waitForReady(baseUrl: string): Promise<void> {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  let lastError = "server did not respond";

  while (Date.now() < deadline) {
    if (server?.exitCode != null) {
      throw new Error(
        `next start exited with code ${server.exitCode} before becoming ready.\n${serverLog}`,
      );
    }

    try {
      const res = await fetch(`${baseUrl}/api/health`);
      const body = (await res.json()) as { database?: string; message?: string };
      if (res.ok && body.database === "up") {
        return;
      }
      lastError = body.message ?? `health returned HTTP ${res.status}`;
    } catch (err: unknown) {
      lastError = err instanceof Error ? err.message : String(err);
    }

    await new Promise((r) => setTimeout(r, 500));
  }

  throw new Error(
    `App was not ready within ${READY_TIMEOUT_MS}ms: ${lastError}\n${serverLog}`,
  );
}

export async function setup(project: TestProject): Promise<void> {
  if (!existsSync(new URL("../../.next/BUILD_ID", import.meta.url))) {
    throw new Error(
      "No production build found. Run `npm run build` before `npm run test:integration`.",
    );
  }

  console.log(`[integration] starting ${POSTGRES_IMAGE}...`);
  container = await new PostgreSqlContainer(POSTGRES_IMAGE).start();
  const databaseUrl = container.getConnectionUri();

  console.log("[integration] applying migrations...");
  // A child process, not an in-process call: MikroORM imports migration files
  // dynamically at runtime, which would bypass Vitest's transform pipeline.
  await execFileAsync(bin("tsx"), ["scripts/db-migrate.ts"], {
    cwd: repoRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });

  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;

  console.log(`[integration] starting app on ${baseUrl}...`);
  server = spawn(bin("next"), ["start", "--port", String(port)], {
    cwd: repoRoot,
    env: { ...process.env, DATABASE_URL: databaseUrl },
  });

  // Buffered so a startup failure can be reported with its actual cause, and
  // echoed because a 500 thrown inside a Server Component is otherwise invisible
  // to the test: the browser only ever sees a generic error page.
  const relay = (chunk: Buffer) => {
    const text = chunk.toString();
    serverLog += text;
    for (const line of text.split("\n")) {
      if (line.trim()) console.log(`[app] ${line}`);
    }
  };
  server.stdout.on("data", relay);
  server.stderr.on("data", relay);

  await waitForReady(baseUrl);
  console.log("[integration] app is ready");

  project.provide("baseUrl", baseUrl);
  project.provide("databaseUrl", databaseUrl);
}

export async function teardown(): Promise<void> {
  if (server && server.exitCode === null) {
    const exited = new Promise<void>((resolve) => {
      server?.once("exit", () => resolve());
    });
    server.kill("SIGTERM");
    // Escalate if the server ignores SIGTERM, so CI cannot hang here.
    const timer = setTimeout(() => server?.kill("SIGKILL"), 5_000);
    await exited;
    clearTimeout(timer);
  }
  server = undefined;

  await container?.stop();
  container = undefined;
}
