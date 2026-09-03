import { describe, expect, it, vi } from 'vitest';
import {
  DATABASE_POLL_INTERVAL_MS,
  DATABASE_PROBE_TIMEOUT_MS,
  DATABASE_READY_TIMEOUT_MS,
  MINIMUM_NODE_MAJOR,
  configureEnvironment,
  installDependencies,
  npmExecutable,
  preflight,
  provisionDatabase,
  runNpmScript,
  runSetup,
  startDatabase,
  waitForDatabase,
} from './run.mjs';

/**
 * Build a fake effects object. `run` is driven by a queue of responses keyed by the
 * command line, so a test only specifies the calls it cares about.
 *
 * @param {object} [overrides]
 */
function fakeEffects(overrides = {}) {
  return {
    run: vi.fn().mockResolvedValue({ code: 0, stdout: '', stderr: '' }),
    readText: vi.fn().mockResolvedValue(null),
    writeText: vi.fn().mockResolvedValue(undefined),
    mtime: vi.fn().mockResolvedValue(null),
    probeTcp: vi.fn().mockResolvedValue(false),
    log: vi.fn(),
    sleep: vi.fn().mockResolvedValue(undefined),
    nodeVersion: 'v24.10.0',
    platform: 'linux',
    env: {},
    ...overrides,
  };
}

describe('npmExecutable', () => {
  it('uses the cmd shim on Windows', () => {
    expect(npmExecutable('win32')).toBe('npm.cmd');
  });

  it('uses plain npm elsewhere', () => {
    expect(npmExecutable('darwin')).toBe('npm');
  });
});

describe('constants', () => {
  it('keeps the Node floor aligned with package.json engines', () => {
    expect(MINIMUM_NODE_MAJOR).toBe(24);
  });

  it('polls the database health more than once within the timeout', () => {
    expect(DATABASE_READY_TIMEOUT_MS).toBeGreaterThan(DATABASE_POLL_INTERVAL_MS);
  });

  it('probes for an existing database without waiting long', () => {
    expect(DATABASE_PROBE_TIMEOUT_MS).toBeLessThan(DATABASE_READY_TIMEOUT_MS);
  });
});

describe('preflight', () => {
  it('passes on a supported Node and does not require Docker', () => {
    const effects = fakeEffects();

    const result = preflight(effects);

    expect(result.status).toBe('ran');
    expect(result.detail).toBe('Node v24.10.0');
    expect(effects.run).not.toHaveBeenCalled();
  });

  it('fails on an unsupported Node', () => {
    const result = preflight(fakeEffects({ nodeVersion: 'v20.0.0' }));

    expect(result.status).toBe('failed');
    expect(result.detail).toContain('requires Node >= 24');
  });
});

describe('provisionDatabase', () => {
  it('reuses a PostgreSQL that is already listening and never touches Docker', async () => {
    const effects = fakeEffects({
      probeTcp: vi.fn().mockResolvedValue(true),
      env: { DATABASE_URL: 'postgres://user@db.example.com:6543/devmentor' },
    });

    const results = await provisionDatabase(effects, { probeTimeoutMs: 50 });

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('skipped');
    expect(results[0].detail).toContain('db.example.com:6543');
    expect(results[0].detail).toContain('DATABASE_URL from the environment');
    expect(results[0].detail).toContain('Docker not needed');
    expect(effects.probeTcp).toHaveBeenCalledWith('db.example.com', 6543, 50);
    expect(effects.run).not.toHaveBeenCalled();
  });

  it('reads the target from .env when the environment is bare', async () => {
    const effects = fakeEffects({
      probeTcp: vi.fn().mockResolvedValue(true),
      readText: vi.fn(async (path) => (path === '.env' ? 'DB_HOST=pg.local\nDB_PORT=6000\n' : null)),
    });

    const results = await provisionDatabase(effects);

    expect(effects.probeTcp).toHaveBeenCalledWith('pg.local', 6000, DATABASE_PROBE_TIMEOUT_MS);
    expect(results[0].detail).toContain('pg.local:6000');
  });

  it('falls back to Docker when nothing is listening', async () => {
    const effects = fakeEffects({
      run: vi.fn(async (command, args) => {
        if (command === 'docker' && args[1] === 'ps') {
          return { code: 0, stdout: '[{"Health":"healthy"}]', stderr: '' };
        }
        return { code: 0, stdout: '', stderr: '' };
      }),
    });

    const results = await provisionDatabase(effects, { timeoutMs: 100, intervalMs: 10 });

    expect(results.map((result) => result.name)).toEqual([
      'Start PostgreSQL',
      'Wait for PostgreSQL',
    ]);
    expect(results.every((result) => result.status === 'ran')).toBe(true);
    expect(effects.run).toHaveBeenCalledWith('docker', ['compose', 'version']);
  });

  it('fails with both remedies when no database is listening and Docker is absent', async () => {
    const effects = fakeEffects({
      run: vi.fn().mockResolvedValue({ code: -1, stdout: '', stderr: 'spawn docker ENOENT' }),
    });

    const results = await provisionDatabase(effects);

    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('failed');
    expect(results[0].detail).toContain('nothing is listening on 127.0.0.1:5432');
    expect(results[0].detail).toContain('either start Docker, or point DATABASE_URL');
  });

  it('stops after a failed compose up without waiting for health', async () => {
    const effects = fakeEffects({
      run: vi.fn(async (command, args) => {
        if (args[1] === 'version') {
          return { code: 0, stdout: '', stderr: '' };
        }
        return { code: 1, stdout: '', stderr: 'port clash' };
      }),
    });

    const results = await provisionDatabase(effects, { timeoutMs: 100, intervalMs: 10 });

    expect(results).toHaveLength(1);
    expect(results[0].name).toBe('Start PostgreSQL');
    expect(results[0].status).toBe('failed');
  });
});

describe('installDependencies', () => {
  it('skips when node_modules is already current', async () => {
    const effects = fakeEffects({
      mtime: vi.fn(async (path) => (path === 'package-lock.json' ? 100 : 200)),
    });

    const result = await installDependencies(effects);

    expect(result.status).toBe('skipped');
    expect(effects.run).not.toHaveBeenCalled();
  });

  it('installs when the lockfile is newer than the last install', async () => {
    const effects = fakeEffects({
      mtime: vi.fn(async (path) => (path === 'package-lock.json' ? 300 : 100)),
    });

    const result = await installDependencies(effects);

    expect(result.status).toBe('ran');
    expect(effects.run).toHaveBeenCalledWith('npm', ['install']);
  });

  it('fails and reports the exit code when npm install breaks', async () => {
    const effects = fakeEffects({
      run: vi.fn().mockResolvedValue({ code: 1, stdout: '', stderr: 'boom' }),
    });

    const result = await installDependencies(effects);

    expect(result.status).toBe('failed');
    expect(result.detail).toContain('exited with code 1');
  });
});

describe('configureEnvironment', () => {
  it('copies the example when .env does not exist', async () => {
    const effects = fakeEffects({
      readText: vi.fn(async (path) => (path === '.env.example' ? 'A=1\n' : null)),
    });

    const result = await configureEnvironment(effects);

    expect(result.status).toBe('ran');
    expect(effects.writeText).toHaveBeenCalledWith('.env', 'A=1\n');
  });

  it('fails when .env.example is missing from the repository', async () => {
    const effects = fakeEffects();

    const result = await configureEnvironment(effects);

    expect(result.status).toBe('failed');
    expect(result.detail).toContain('.env.example is missing');
    expect(effects.writeText).not.toHaveBeenCalled();
  });

  it('never overwrites an existing complete .env', async () => {
    const effects = fakeEffects({
      readText: vi.fn(async (path) => (path === '.env.example' ? 'A=1\n' : 'A=local\n')),
    });

    const result = await configureEnvironment(effects);

    expect(result.status).toBe('skipped');
    expect(effects.writeText).not.toHaveBeenCalled();
  });

  it('warns about documented variables the existing .env does not set', async () => {
    const effects = fakeEffects({
      readText: vi.fn(async (path) => (path === '.env.example' ? 'A=1\nB=2\n' : 'A=local\n')),
    });

    const result = await configureEnvironment(effects);

    expect(result.status).toBe('warned');
    expect(result.detail).toContain('does not set: B');
    expect(effects.writeText).not.toHaveBeenCalled();
  });
});

describe('startDatabase', () => {
  it('brings the postgres service up', async () => {
    const effects = fakeEffects();

    const result = await startDatabase(effects);

    expect(result.status).toBe('ran');
    expect(effects.run).toHaveBeenCalledWith('docker', ['compose', 'up', '-d', 'postgres']);
  });

  it('fails and includes stderr when compose refuses', async () => {
    const effects = fakeEffects({
      run: vi.fn().mockResolvedValue({ code: 1, stdout: '', stderr: '  port in use  ' }),
    });

    const result = await startDatabase(effects);

    expect(result.status).toBe('failed');
    expect(result.detail).toBe('docker compose up exited with code 1: port in use');
  });

  it('omits the stderr suffix when compose fails silently', async () => {
    const effects = fakeEffects({
      run: vi.fn().mockResolvedValue({ code: 2, stdout: '', stderr: '   ' }),
    });

    const result = await startDatabase(effects);

    expect(result.detail).toBe('docker compose up exited with code 2');
  });
});

describe('waitForDatabase', () => {
  it('returns as soon as the container reports healthy', async () => {
    const effects = fakeEffects({
      run: vi.fn().mockResolvedValue({
        code: 0,
        stdout: '[{"Health":"healthy","State":"running"}]',
        stderr: '',
      }),
    });

    const result = await waitForDatabase(effects, { timeoutMs: 1_000, intervalMs: 100 });

    expect(result.status).toBe('ran');
    expect(effects.run).toHaveBeenCalledTimes(1);
    expect(effects.sleep).not.toHaveBeenCalled();
  });

  it('keeps polling while the container is still starting', async () => {
    const responses = [
      { code: 0, stdout: '[{"Health":"starting","State":"running"}]', stderr: '' },
      { code: 0, stdout: '[{"Health":"healthy","State":"running"}]', stderr: '' },
    ];
    const effects = fakeEffects({
      run: vi.fn(async () => responses.shift()),
    });

    const result = await waitForDatabase(effects, { timeoutMs: 1_000, intervalMs: 100 });

    expect(result.status).toBe('ran');
    expect(effects.sleep).toHaveBeenCalledWith(100);
  });

  it('gives up with the last observed state when the timeout expires', async () => {
    const effects = fakeEffects({
      run: vi.fn().mockResolvedValue({
        code: 0,
        stdout: '[{"Health":"unhealthy","State":"running"}]',
        stderr: '',
      }),
    });

    const result = await waitForDatabase(effects, { timeoutMs: 200, intervalMs: 100 });

    expect(result.status).toBe('failed');
    expect(result.detail).toContain('last state: unhealthy');
    expect(effects.run).toHaveBeenCalledTimes(2);
  });

  it('treats a failing ps command as an unknown state', async () => {
    const effects = fakeEffects({
      run: vi.fn().mockResolvedValue({ code: 1, stdout: '', stderr: 'no such service' }),
    });

    const result = await waitForDatabase(effects, { timeoutMs: 100, intervalMs: 100 });

    expect(result.status).toBe('failed');
    expect(result.detail).toContain('last state: unknown');
  });

  it('polls at least once even with a nonsensical timeout', async () => {
    const effects = fakeEffects({
      run: vi.fn().mockResolvedValue({ code: 0, stdout: '', stderr: '' }),
    });

    const result = await waitForDatabase(effects, { timeoutMs: 0, intervalMs: 100 });

    expect(effects.run).toHaveBeenCalledTimes(1);
    expect(result.status).toBe('failed');
  });

  it('falls back to the built-in timings when none are supplied', async () => {
    const effects = fakeEffects({
      run: vi.fn().mockResolvedValue({
        code: 0,
        stdout: '[{"Health":"healthy"}]',
        stderr: '',
      }),
    });

    const result = await waitForDatabase(effects);

    expect(result.status).toBe('ran');
  });
});

describe('runNpmScript', () => {
  it('runs the script and reports it', async () => {
    const effects = fakeEffects();

    const result = await runNpmScript(effects, 'Apply migrations', 'db:migrate');

    expect(result).toEqual({
      name: 'Apply migrations',
      status: 'ran',
      detail: 'npm run db:migrate',
    });
    expect(effects.run).toHaveBeenCalledWith('npm', ['run', 'db:migrate']);
  });

  it('fails with stderr detail', async () => {
    const effects = fakeEffects({
      run: vi.fn().mockResolvedValue({ code: 1, stdout: '', stderr: 'migration clash' }),
    });

    const result = await runNpmScript(effects, 'Apply migrations', 'db:migrate');

    expect(result.status).toBe('failed');
    expect(result.detail).toBe('npm run db:migrate exited with code 1: migration clash');
  });

  it('fails without a stderr suffix when the script is quiet', async () => {
    const effects = fakeEffects({
      run: vi.fn().mockResolvedValue({ code: 3, stdout: '', stderr: '' }),
    });

    const result = await runNpmScript(effects, 'Seed sample data', 'db:seed');

    expect(result.detail).toBe('npm run db:seed exited with code 3');
  });
});

describe('runSetup', () => {
  /**
   * Effects wired so every step succeeds against a healthy, already-installed repo
   * whose database has to be started by Docker.
   */
  function happyEffects() {
    return fakeEffects({
      run: vi.fn(async (command, args) => {
        if (command === 'docker' && args[1] === 'ps') {
          return { code: 0, stdout: '[{"Health":"healthy","State":"running"}]', stderr: '' };
        }
        return { code: 0, stdout: '', stderr: '' };
      }),
      mtime: vi.fn(async (path) => (path === 'package-lock.json' ? 100 : 200)),
      readText: vi.fn(async (path) => (path === '.env.example' ? 'A=1\n' : 'A=local\n')),
    });
  }

  it('runs every step in order and exits zero', async () => {
    const effects = happyEffects();

    const code = await runSetup(effects, { timeoutMs: 1_000, intervalMs: 10 });

    expect(code).toBe(0);

    const output = effects.log.mock.calls.map(([line]) => line).join('\n');
    expect(output).toContain('re-running is safe');
    expect(output).toContain('Preflight (ran)');
    expect(output).toContain('Install dependencies (skipped)');
    expect(output).toContain('Configure .env (skipped)');
    expect(output).toContain('Start PostgreSQL (ran)');
    expect(output).toContain('Wait for PostgreSQL (ran)');
    expect(output).toContain('Apply migrations (ran)');
    expect(output).toContain('Seed sample data (ran)');
    expect(output).toContain('npm run dev');
  });

  it('skips Docker entirely when a PostgreSQL is already running', async () => {
    const effects = happyEffects();
    effects.probeTcp.mockResolvedValue(true);

    const code = await runSetup(effects, { timeoutMs: 1_000, intervalMs: 10 });

    expect(code).toBe(0);

    const output = effects.log.mock.calls.map(([line]) => line).join('\n');
    expect(output).toContain('Provision PostgreSQL (skipped)');
    expect(output).not.toContain('Start PostgreSQL');
    expect(output).not.toContain('Wait for PostgreSQL');
    expect(output).toContain('Apply migrations (ran)');

    const dockerCalls = effects.run.mock.calls.filter(([command]) => command === 'docker');
    expect(dockerCalls).toEqual([]);
  });

  it('is a no-op-shaped second run: nothing is created and it still exits zero', async () => {
    const effects = happyEffects();

    const first = await runSetup(effects, { timeoutMs: 1_000, intervalMs: 10 });
    const second = await runSetup(effects, { timeoutMs: 1_000, intervalMs: 10 });

    expect(first).toBe(0);
    expect(second).toBe(0);
    expect(effects.writeText).not.toHaveBeenCalled();
  });

  it('stops at the first failure and exits non-zero', async () => {
    const effects = fakeEffects({ nodeVersion: 'v18.0.0' });

    const code = await runSetup(effects, { timeoutMs: 100, intervalMs: 10 });

    expect(code).toBe(1);

    const output = effects.log.mock.calls.map(([line]) => line).join('\n');
    expect(output).toContain('Preflight (failed)');
    expect(output).not.toContain('Install dependencies');
    expect(output).toContain('Fix the failures above');
  });

  it('uses the default database timings when no options are passed', async () => {
    const effects = happyEffects();

    const code = await runSetup(effects);

    expect(code).toBe(0);
  });
});
