import {
  FAILED,
  RAN,
  SKIPPED,
  WARNED,
  checkNodeVersion,
  formatStep,
  formatSummary,
  isInstallCurrent,
  missingEnvKeys,
  parseComposeHealth,
  resolveDatabaseTarget,
} from './steps.mjs';

/** Lowest Node major DevMentor supports — keep in sync with `engines.node`. */
export const MINIMUM_NODE_MAJOR = 24;

/** How long to wait for the Postgres container's healthcheck to pass. */
export const DATABASE_READY_TIMEOUT_MS = 120_000;
export const DATABASE_POLL_INTERVAL_MS = 1_000;

/** How long to wait for an already-running PostgreSQL to accept a connection. */
export const DATABASE_PROBE_TIMEOUT_MS = 2_000;

/**
 * On Windows, `npm` is a shell shim; spawning without a shell needs the `.cmd` name.
 * Same guard `tests/integration/global-setup.ts` uses.
 *
 * @param {string} platform
 * @returns {string}
 */
export function npmExecutable(platform) {
  return platform === 'win32' ? 'npm.cmd' : 'npm';
}

/**
 * Every step reports a detail, so the developer can see *why* it ran or was skipped.
 *
 * @param {string} name
 * @param {string} status
 * @param {string} detail
 */
function step(name, status, detail) {
  return { name, status, detail };
}

/**
 * Check the one hard prerequisite: a new enough Node.
 *
 * Docker is deliberately *not* checked here — it is only needed when no PostgreSQL is
 * already running, which `provisionDatabase` decides.
 *
 * @param {import('./effects.mjs').SetupEffects} effects
 */
export function preflight(effects) {
  const node = checkNodeVersion(effects.nodeVersion, MINIMUM_NODE_MAJOR);

  return node.ok
    ? step('Preflight', RAN, node.detail)
    : step('Preflight', FAILED, node.detail);
}

/**
 * `npm install`, skipped when the installed tree already matches the lockfile.
 *
 * @param {import('./effects.mjs').SetupEffects} effects
 */
export async function installDependencies(effects) {
  const [lockMtime, markerMtime] = await Promise.all([
    effects.mtime('package-lock.json'),
    effects.mtime('node_modules/.package-lock.json'),
  ]);

  if (isInstallCurrent(lockMtime, markerMtime)) {
    return step('Install dependencies', SKIPPED, 'node_modules is up to date with package-lock.json');
  }

  const result = await effects.run(npmExecutable(effects.platform), ['install']);

  if (result.code !== 0) {
    return step('Install dependencies', FAILED, `npm install exited with code ${result.code}`);
  }

  return step('Install dependencies', RAN, 'npm install');
}

/**
 * Create `.env` from `.env.example` — but never overwrite an existing one, which holds
 * the developer's real local configuration and is git-ignored. When `.env` is already
 * there, report any variable the example declares that it is missing.
 *
 * @param {import('./effects.mjs').SetupEffects} effects
 */
export async function configureEnvironment(effects) {
  const example = await effects.readText('.env.example');

  if (example === null) {
    return step('Configure .env', FAILED, '.env.example is missing from the repository');
  }

  const existing = await effects.readText('.env');

  if (existing === null) {
    await effects.writeText('.env', example);
    return step('Configure .env', RAN, 'copied .env.example to .env');
  }

  const missing = missingEnvKeys(example, existing);

  if (missing.length > 0) {
    return step(
      'Configure .env',
      WARNED,
      `.env already exists and was left untouched, but it does not set: ${missing.join(', ')}`,
    );
  }

  return step('Configure .env', SKIPPED, '.env already exists and sets every documented variable');
}

/**
 * `docker compose up -d postgres` — already a no-op for a running container.
 *
 * @param {import('./effects.mjs').SetupEffects} effects
 */
export async function startDatabase(effects) {
  const result = await effects.run('docker', ['compose', 'up', '-d', 'postgres']);

  if (result.code !== 0) {
    return step(
      'Start PostgreSQL',
      FAILED,
      `docker compose up exited with code ${result.code}${result.stderr.trim() ? `: ${result.stderr.trim()}` : ''}`,
    );
  }

  return step('Start PostgreSQL', RAN, 'docker compose up -d postgres');
}

/**
 * Wait for the container's `pg_isready` healthcheck before migrating. The manual
 * README steps do not do this, which races container startup on a cold `db:up`.
 *
 * @param {import('./effects.mjs').SetupEffects} effects
 * @param {{timeoutMs?: number, intervalMs?: number}} [options]
 */
export async function waitForDatabase(effects, options = {}) {
  const timeoutMs = options.timeoutMs ?? DATABASE_READY_TIMEOUT_MS;
  // Clamp the interval: a zero would make `attempts` Infinity and spin forever.
  const intervalMs = Math.max(1, options.intervalMs ?? DATABASE_POLL_INTERVAL_MS);
  const attempts = Math.max(1, Math.ceil(timeoutMs / intervalMs));
  let last = 'unknown';

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const result = await effects.run('docker', ['compose', 'ps', '--format', 'json', 'postgres']);
    last = result.code === 0 ? parseComposeHealth(result.stdout) : 'unknown';

    if (last === 'healthy') {
      return step('Wait for PostgreSQL', RAN, 'container reports healthy');
    }

    // Nothing to wait for after the final check — the loop is about to give up.
    if (attempt < attempts - 1) {
      await effects.sleep(intervalMs);
    }
  }

  return step(
    'Wait for PostgreSQL',
    FAILED,
    `the postgres container did not become healthy within ${Math.round(timeoutMs / 1000)}s (last state: ${last})`,
  );
}

/**
 * Make a PostgreSQL available, preferring one that already exists.
 *
 * Docker is a *fallback*, not a requirement: if something is already listening at the
 * address the app is configured to use — a container someone started, a native
 * install, or a managed remote database named by `DATABASE_URL` — setup reuses it and
 * never touches Docker. Docker Compose is only consulted when nothing answers, and
 * only then does its absence become an error.
 *
 * @param {import('./effects.mjs').SetupEffects} effects
 * @param {{timeoutMs?: number, intervalMs?: number, probeTimeoutMs?: number}} [options]
 * @returns {Promise<Array<{name: string, status: string, detail: string}>>}
 */
export async function provisionDatabase(effects, options = {}) {
  const envText = (await effects.readText('.env')) ?? '';
  const target = resolveDatabaseTarget(effects.env, envText);
  const address = `${target.host}:${target.port}`;

  const reachable = await effects.probeTcp(
    target.host,
    target.port,
    options.probeTimeoutMs ?? DATABASE_PROBE_TIMEOUT_MS,
  );

  if (reachable) {
    // A TCP probe proves only that *something* answers, not that it speaks Postgres —
    // so say what was observed rather than claiming more. If it turns out not to be the
    // DevMentor database, the migrate step below reports the real error.
    return [
      step(
        'Provision PostgreSQL',
        SKIPPED,
        `something is accepting connections on ${address} (per ${target.source}) — reusing it as the DevMentor database; Docker not needed`,
      ),
    ];
  }

  const docker = await effects.run('docker', ['compose', 'version']);

  if (docker.code !== 0) {
    return [
      step(
        'Provision PostgreSQL',
        FAILED,
        `nothing is listening on ${address} (per ${target.source}) and Docker with Compose v2 is not available to start one — either start Docker, or point DATABASE_URL at a PostgreSQL you already run, then run \`npm run setup\` again`,
      ),
    ];
  }

  const started = await startDatabase(effects);

  if (started.status === FAILED) {
    return [started];
  }

  return [started, await waitForDatabase(effects, options)];
}

/**
 * Run one root npm script as a step. MikroORM's migrator skips already-applied
 * migrations and the seeder is idempotent, so both are safe to invoke unconditionally.
 *
 * @param {import('./effects.mjs').SetupEffects} effects
 * @param {string} name
 * @param {string} script
 */
export async function runNpmScript(effects, name, script) {
  const result = await effects.run(npmExecutable(effects.platform), ['run', script]);

  if (result.code !== 0) {
    return step(
      name,
      FAILED,
      `npm run ${script} exited with code ${result.code}${result.stderr.trim() ? `: ${result.stderr.trim()}` : ''}`,
    );
  }

  return step(name, RAN, `npm run ${script}`);
}

/**
 * The ordered installer. Stops at the first failed step and returns a process exit
 * code. Deliberately does **not** start the dev server: `npm run dev` never exits, so
 * running it here would hang `npm run setup`; the summary prints it instead.
 *
 * @param {import('./effects.mjs').SetupEffects} effects
 * @param {{timeoutMs?: number, intervalMs?: number, probeTimeoutMs?: number}} [options]
 * @returns {Promise<number>} 0 on success, 1 when a step failed
 */
export async function runSetup(effects, options = {}) {
  // Each task yields one or more step results, so provisioning can report either a
  // single "reused an existing PostgreSQL" line or the two-line Docker path.
  const plan = [
    async () => [preflight(effects)],
    async () => [await installDependencies(effects)],
    async () => [await configureEnvironment(effects)],
    () => provisionDatabase(effects, options),
    async () => [await runNpmScript(effects, 'Apply migrations', 'db:migrate')],
    async () => [await runNpmScript(effects, 'Seed sample data', 'db:seed')],
  ];

  effects.log('DevMentor setup — re-running is safe; completed steps are skipped.');
  effects.log('');

  const results = [];

  for (const task of plan) {
    const produced = await task();

    for (const result of produced) {
      results.push(result);
      effects.log(formatStep(result));
    }

    if (produced.some((result) => result.status === FAILED)) {
      break;
    }
  }

  for (const line of formatSummary(results)) {
    effects.log(line);
  }

  return results.some((result) => result.status === FAILED) ? 1 : 0;
}
