/**
 * Pure helpers for the `npm run setup` installer.
 *
 * Everything here is side-effect free so the installer's decisions — "is this step
 * already done?", "is Postgres healthy yet?" — are unit-testable without Docker, npm,
 * or the filesystem. The effectful counterparts live in `effects.mjs`; the ordering
 * lives in `run.mjs`.
 *
 * Plain Node ESM with no imports outside `node:*` on purpose: `npm run setup` must
 * work on a freshly cloned repository, before `npm install` has created
 * `node_modules`, so the installer cannot depend on `tsx` or any package.
 */

/** Step outcome states, in increasing order of developer attention required. */
export const RAN = 'ran';
export const SKIPPED = 'skipped';
export const WARNED = 'warned';
export const FAILED = 'failed';

/**
 * Extract the major version from a `process.version` string.
 *
 * @param {string} version e.g. `"v24.10.0"`
 * @returns {number|null} the major number, or `null` when unparseable
 */
export function parseNodeMajor(version) {
  const match = /^v?(\d+)\./.exec(String(version));
  return match ? Number(match[1]) : null;
}

/**
 * Check the running Node against the repository's `engines.node` floor.
 *
 * @param {string} version `process.version`
 * @param {number} minimumMajor lowest supported major
 * @returns {{ok: boolean, detail: string}}
 */
export function checkNodeVersion(version, minimumMajor) {
  const major = parseNodeMajor(version);

  if (major === null) {
    return { ok: false, detail: `could not parse the Node version "${version}"` };
  }

  if (major < minimumMajor) {
    return {
      ok: false,
      detail: `Node ${version} is too old — DevMentor requires Node >= ${minimumMajor} (see "engines" in package.json)`,
    };
  }

  return { ok: true, detail: `Node ${version}` };
}

/** Where the local database lives when nothing says otherwise. */
export const DEFAULT_POSTGRES_HOST = '127.0.0.1';
export const DEFAULT_POSTGRES_PORT = 5432;

/**
 * Read an env file into its key/value assignments.
 *
 * Commented-out lines are deliberately ignored: `.env.example` documents
 * `# DATABASE_URL=...` as an *alternative* to the discrete `DB_*` variables, so
 * treating it as set would misread every correct `.env`. The first assignment of a
 * key wins, and surrounding quotes are stripped.
 *
 * @param {string} text env-file contents
 * @returns {Record<string, string>} assignments, in file order
 */
export function parseEnvAssignments(text) {
  /** @type {Record<string, string>} */
  const values = {};

  for (const rawLine of String(text).split(/\r?\n/)) {
    const line = rawLine.trim();

    if (line === '' || line.startsWith('#')) {
      continue;
    }

    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(line);

    if (match && !Object.hasOwn(values, match[1])) {
      values[match[1]] = stripQuotes(match[2].trim());
    }
  }

  return values;
}

/**
 * @param {string} value
 * @returns {string}
 */
function stripQuotes(value) {
  const match = /^(['"])([\s\S]*)\1$/.exec(value);
  return match ? match[2] : value;
}

/**
 * Collect the variable names an env file actually sets.
 *
 * @param {string} text env-file contents
 * @returns {string[]} declared keys, in file order, without duplicates
 */
export function parseEnvKeys(text) {
  return Object.keys(parseEnvAssignments(text));
}

/**
 * Extract host and port from a PostgreSQL connection URL.
 *
 * @param {string} url
 * @returns {{host: string, port: number}|null} `null` when it is not a usable URL
 */
export function parsePostgresUrl(url) {
  let parsed;

  try {
    parsed = new URL(String(url));
  } catch {
    return null;
  }

  if (parsed.hostname === '') {
    return null;
  }

  return { host: parsed.hostname, port: toPort(parsed.port, DEFAULT_POSTGRES_PORT) };
}

/**
 * @param {string|undefined} value
 * @param {number} fallback
 * @returns {number}
 */
function toPort(value, fallback) {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 ? port : fallback;
}

/**
 * Work out which PostgreSQL the app is configured to talk to, so setup can reuse an
 * already-running instance instead of insisting on the Docker one.
 *
 * Precedence mirrors the Zod config modules: `DATABASE_URL` wins over the discrete
 * `DB_*` variables, and the real environment wins over `.env`.
 *
 * @param {Record<string, string|undefined>} [processEnv] the ambient environment
 * @param {string} [envFileText] contents of `.env`, if it exists
 * @returns {{host: string, port: number, source: string}}
 */
export function resolveDatabaseTarget(processEnv = {}, envFileText = '') {
  const fromFile = parseEnvAssignments(envFileText);

  /** @param {string} key */
  const pick = (key) => {
    const ambient = processEnv[key];

    if (ambient !== undefined && ambient !== '') {
      return { value: ambient, origin: 'the environment' };
    }

    const declared = fromFile[key];

    if (declared !== undefined && declared !== '') {
      return { value: declared, origin: '.env' };
    }

    return null;
  };

  const url = pick('DATABASE_URL');

  if (url !== null) {
    const parsed = parsePostgresUrl(url.value);

    if (parsed !== null) {
      return { ...parsed, source: `DATABASE_URL from ${url.origin}` };
    }
  }

  const host = pick('DB_HOST');
  const port = pick('DB_PORT');

  if (host !== null || port !== null) {
    return {
      host: host === null ? DEFAULT_POSTGRES_HOST : host.value,
      port: port === null ? DEFAULT_POSTGRES_PORT : toPort(port.value, DEFAULT_POSTGRES_PORT),
      source: `DB_HOST/DB_PORT from ${(host ?? port).origin}`,
    };
  }

  return {
    host: DEFAULT_POSTGRES_HOST,
    port: DEFAULT_POSTGRES_PORT,
    source: 'the built-in defaults',
  };
}

/**
 * Keys the example declares that the developer's `.env` does not.
 *
 * @param {string} exampleText contents of `.env.example`
 * @param {string} envText contents of `.env`
 * @returns {string[]}
 */
export function missingEnvKeys(exampleText, envText) {
  const present = parseEnvKeys(envText);
  return parseEnvKeys(exampleText).filter((key) => !present.includes(key));
}

/**
 * Decide whether `npm install` can be skipped.
 *
 * npm writes `node_modules/.package-lock.json` at the end of a successful install, so
 * a marker at least as new as `package-lock.json` means the tree is current.
 *
 * @param {number|null} lockMtime mtime of `package-lock.json`, or `null` if absent
 * @param {number|null} markerMtime mtime of `node_modules/.package-lock.json`
 * @returns {boolean} true when the installed tree is up to date
 */
export function isInstallCurrent(lockMtime, markerMtime) {
  if (markerMtime === null) {
    return false;
  }

  if (lockMtime === null) {
    return true;
  }

  return markerMtime >= lockMtime;
}

/**
 * Read the health of the compose `postgres` service out of `docker compose ps` output.
 *
 * Compose v2 has emitted both a JSON array and newline-delimited JSON objects across
 * releases, and prints nothing at all when no container exists — all three are normal
 * inputs here, as is malformed output from an unexpected client.
 *
 * @param {string} stdout raw stdout of `docker compose ps --format json`
 * @returns {'healthy'|'starting'|'unhealthy'|'absent'|'unknown'}
 */
export function parseComposeHealth(stdout) {
  const entries = parseComposeEntries(stdout);

  if (entries === null) {
    return 'unknown';
  }

  if (entries.length === 0) {
    return 'absent';
  }

  const [service] = entries;
  const health = String(service.Health ?? '').toLowerCase();

  if (health === 'healthy') {
    return 'healthy';
  }

  if (health === 'unhealthy') {
    return 'unhealthy';
  }

  // A service with no healthcheck reports an empty Health; fall back to its state so a
  // running-but-uncheckable container is not mistaken for a broken one.
  if (health === '' && String(service.State ?? '').toLowerCase() === 'running') {
    return 'healthy';
  }

  return 'starting';
}

/**
 * @param {string} stdout
 * @returns {Array<Record<string, unknown>>|null} parsed records, or `null` when the
 *   output could not be understood at all
 */
function parseComposeEntries(stdout) {
  const text = String(stdout).trim();

  if (text === '') {
    return [];
  }

  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch {
    return parseNdjson(text);
  }
}

/**
 * @param {string} text
 * @returns {Array<Record<string, unknown>>|null}
 */
function parseNdjson(text) {
  const records = [];

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (trimmed === '') {
      continue;
    }

    try {
      records.push(JSON.parse(trimmed));
    } catch {
      return null;
    }
  }

  return records;
}

const STATUS_MARKS = {
  [RAN]: '✔',
  [SKIPPED]: '↷',
  [WARNED]: '!',
  [FAILED]: '✖',
};

/**
 * Render one step result as a console line.
 *
 * @param {{name: string, status: string, detail?: string}} result
 * @returns {string}
 */
export function formatStep(result) {
  const mark = STATUS_MARKS[result.status] ?? '·';
  const detail = result.detail ? ` — ${result.detail}` : '';
  return `${mark} ${result.name} (${result.status})${detail}`;
}

/**
 * Render the closing summary: a per-status tally plus the next command to run.
 *
 * @param {Array<{name: string, status: string, detail?: string}>} results
 * @returns {string[]} lines to print
 */
export function formatSummary(results) {
  const tally = (status) => results.filter((result) => result.status === status).length;
  const failures = results.filter((result) => result.status === FAILED);

  const lines = [
    '',
    `Setup finished: ${tally(RAN)} ran, ${tally(SKIPPED)} skipped, ${tally(WARNED)} warned, ${failures.length} failed.`,
  ];

  if (failures.length > 0) {
    lines.push('', 'Setup did not complete. Fix the failures above and run `npm run setup` again.');
    return lines;
  }

  lines.push(
    '',
    'DevMentor is ready. Start the app with:',
    '',
    '  npm run dev',
    '',
    'Then open http://localhost:3000 (public) or http://localhost:3000/admin (admin).',
  );

  return lines;
}
