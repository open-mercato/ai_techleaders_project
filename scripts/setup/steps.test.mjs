import { describe, expect, it } from 'vitest';
import {
  DATABASE_URL_SUPERSEDES,
  DEFAULT_POSTGRES_HOST,
  DEFAULT_POSTGRES_PORT,
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
  parseEnvAssignments,
  parseEnvKeys,
  parseNodeMajor,
  parsePostgresUrl,
  resolveDatabaseTarget,
} from './steps.mjs';

describe('parseNodeMajor', () => {
  it('reads the major out of a v-prefixed version', () => {
    expect(parseNodeMajor('v24.10.0')).toBe(24);
  });

  it('reads the major out of a bare version', () => {
    expect(parseNodeMajor('20.1.2')).toBe(20);
  });

  it('returns null when the version cannot be parsed', () => {
    expect(parseNodeMajor('not-a-version')).toBeNull();
  });
});

describe('checkNodeVersion', () => {
  it('accepts a Node newer than the floor', () => {
    expect(checkNodeVersion('v24.10.0', 24)).toEqual({ ok: true, detail: 'Node v24.10.0' });
  });

  it('accepts a Node exactly at the floor', () => {
    expect(checkNodeVersion('v24.0.0', 24).ok).toBe(true);
  });

  it('rejects a Node below the floor and names the requirement', () => {
    const result = checkNodeVersion('v20.11.0', 24);

    expect(result.ok).toBe(false);
    expect(result.detail).toContain('requires Node >= 24');
  });

  it('rejects an unparseable version', () => {
    const result = checkNodeVersion('banana', 24);

    expect(result.ok).toBe(false);
    expect(result.detail).toContain('could not parse');
  });
});

describe('parseEnvKeys', () => {
  it('collects assigned keys and ignores blanks and comments', () => {
    const text = [
      '# --- App ---',
      '',
      'NODE_ENV=development',
      '   LOG_LEVEL=debug   ',
      '# DATABASE_URL=postgres://ignored',
      'export DB_HOST=127.0.0.1',
      'not an assignment',
      '1INVALID=x',
    ].join('\n');

    expect(parseEnvKeys(text)).toEqual(['NODE_ENV', 'LOG_LEVEL', 'DB_HOST']);
  });

  it('handles CRLF line endings', () => {
    expect(parseEnvKeys('A=1\r\nB=2\r\n')).toEqual(['A', 'B']);
  });

  it('does not report a duplicated key twice', () => {
    expect(parseEnvKeys('A=1\nA=2\n')).toEqual(['A']);
  });

  it('returns nothing for empty contents', () => {
    expect(parseEnvKeys('')).toEqual([]);
  });
});

describe('parseEnvAssignments', () => {
  it('reads values and ignores comments and blank lines', () => {
    const text = ['# comment', '', 'A=1', 'export B=two', '# C=3'].join('\n');

    expect(parseEnvAssignments(text)).toEqual({ A: '1', B: 'two' });
  });

  it('strips matching surrounding quotes', () => {
    expect(parseEnvAssignments('A="quoted"\nB=\'single\'\nC=un"even\n')).toEqual({
      A: 'quoted',
      B: 'single',
      C: 'un"even',
    });
  });

  it('keeps the first assignment when a key repeats', () => {
    expect(parseEnvAssignments('A=first\nA=second\n')).toEqual({ A: 'first' });
  });

  it('preserves an empty assignment as an empty string', () => {
    expect(parseEnvAssignments('A=\n')).toEqual({ A: '' });
  });
});

describe('parsePostgresUrl', () => {
  it('reads host and port from a full connection URL', () => {
    expect(parsePostgresUrl('postgres://user:secret@db.example.com:6543/devmentor')).toEqual({
      host: 'db.example.com',
      port: 6543,
    });
  });

  it('falls back to the default port when the URL omits it', () => {
    expect(parsePostgresUrl('postgres://localhost/devmentor')).toEqual({
      host: 'localhost',
      port: DEFAULT_POSTGRES_PORT,
    });
  });

  it('returns null for an unparseable URL', () => {
    expect(parsePostgresUrl('this is not a url')).toBeNull();
  });

  it('returns null for a URL with no host', () => {
    expect(parsePostgresUrl('postgres:///devmentor')).toBeNull();
  });
});

describe('resolveDatabaseTarget', () => {
  it('prefers DATABASE_URL from the ambient environment', () => {
    const target = resolveDatabaseTarget(
      { DATABASE_URL: 'postgres://ambient:5433/db' },
      'DATABASE_URL=postgres://from-file:5555/db\n',
    );

    expect(target).toEqual({
      host: 'ambient',
      port: 5433,
      source: 'DATABASE_URL from the environment',
    });
  });

  it('falls back to DATABASE_URL declared in .env', () => {
    const target = resolveDatabaseTarget({}, 'DATABASE_URL=postgres://from-file:5555/db\n');

    expect(target).toEqual({ host: 'from-file', port: 5555, source: 'DATABASE_URL from .env' });
  });

  it('ignores an empty DATABASE_URL', () => {
    const target = resolveDatabaseTarget({ DATABASE_URL: '' }, 'DB_HOST=fallback\n');

    expect(target.host).toBe('fallback');
  });

  it('ignores an unparseable DATABASE_URL and uses the discrete variables', () => {
    const target = resolveDatabaseTarget({ DATABASE_URL: 'garbage' }, 'DB_HOST=discrete\n');

    expect(target).toEqual({
      host: 'discrete',
      port: DEFAULT_POSTGRES_PORT,
      source: 'DB_HOST/DB_PORT from .env',
    });
  });

  it('uses discrete DB_HOST and DB_PORT together', () => {
    const target = resolveDatabaseTarget({ DB_HOST: 'pg', DB_PORT: '6000' }, '');

    expect(target).toEqual({
      host: 'pg',
      port: 6000,
      source: 'DB_HOST/DB_PORT from the environment',
    });
  });

  it('defaults the host when only a port is configured', () => {
    const target = resolveDatabaseTarget({}, 'DB_PORT=6001\n');

    expect(target).toEqual({
      host: DEFAULT_POSTGRES_HOST,
      port: 6001,
      source: 'DB_HOST/DB_PORT from .env',
    });
  });

  it('defaults a nonsensical port instead of producing NaN', () => {
    expect(resolveDatabaseTarget({ DB_PORT: 'abc' }, '').port).toBe(DEFAULT_POSTGRES_PORT);
  });

  it('falls back to the built-in defaults when nothing is configured', () => {
    expect(resolveDatabaseTarget()).toEqual({
      host: DEFAULT_POSTGRES_HOST,
      port: DEFAULT_POSTGRES_PORT,
      source: 'the built-in defaults',
    });
  });
});

describe('missingEnvKeys', () => {
  /** The two connection styles `.env.example` documents, reduced to their keys. */
  const example = 'DB_HOST=h\nDB_PORT=5432\nDB_NAME=n\nDB_USER=u\nDB_PASSWORD=p\nDB_POOL_MAX=10\n';

  it('lists example keys the env file does not set', () => {
    expect(missingEnvKeys('A=1\nB=2\nC=3\n', 'A=9\nC=9\n')).toEqual(['B']);
  });

  it('returns nothing when every documented key is present', () => {
    expect(missingEnvKeys('A=1\nB=2\n', 'B=9\nA=9\nEXTRA=9\n')).toEqual([]);
  });

  it('accepts a DATABASE_URL in place of the discrete connection variables', () => {
    // Regression guard: `.env.example` documents DATABASE_URL only as a comment, so a
    // `.env` following the README's "Bring your own PostgreSQL" advice used to be
    // warned about five variables it deliberately does not need.
    const env = 'DATABASE_URL=postgres://u:p@h:5432/d\nDB_POOL_MAX=10\n';

    expect(missingEnvKeys(example, env)).toEqual([]);
  });

  it('still requires variables a connection URL says nothing about', () => {
    const env = 'DATABASE_URL=postgres://u:p@h:5432/d\n';

    expect(missingEnvKeys(example, env)).toEqual(['DB_POOL_MAX']);
  });

  it('does not let an empty DATABASE_URL excuse the discrete variables', () => {
    expect(missingEnvKeys(example, 'DATABASE_URL=\nDB_POOL_MAX=10\n')).toEqual(
      DATABASE_URL_SUPERSEDES,
    );
  });
});

describe('isInstallCurrent', () => {
  it('is false when node_modules has no install marker', () => {
    expect(isInstallCurrent(100, null)).toBe(false);
  });

  it('is true when there is no lockfile to compare against', () => {
    expect(isInstallCurrent(null, 100)).toBe(true);
  });

  it('is true when the marker is newer than the lockfile', () => {
    expect(isInstallCurrent(100, 200)).toBe(true);
  });

  it('is true when the marker and the lockfile share an mtime', () => {
    expect(isInstallCurrent(100, 100)).toBe(true);
  });

  it('is false when the lockfile changed after the last install', () => {
    expect(isInstallCurrent(200, 100)).toBe(false);
  });
});

describe('parseComposeHealth', () => {
  it('reads a healthy service from a JSON array', () => {
    expect(parseComposeHealth('[{"Health":"healthy","State":"running"}]')).toBe('healthy');
  });

  it('reads a healthy service from a single JSON object', () => {
    expect(parseComposeHealth('{"Health":"healthy","State":"running"}')).toBe('healthy');
  });

  it('parses newline-delimited JSON and judges the first record', () => {
    const stdout = '{"Health":"starting","State":"running"}\n\n{"Health":"healthy"}\n';

    expect(parseComposeHealth(stdout)).toBe('starting');
  });

  it('reports a starting container', () => {
    expect(parseComposeHealth('[{"Health":"starting","State":"running"}]')).toBe('starting');
  });

  it('reports an unhealthy container', () => {
    expect(parseComposeHealth('[{"Health":"unhealthy","State":"running"}]')).toBe('unhealthy');
  });

  it('treats a running container without a healthcheck as healthy', () => {
    expect(parseComposeHealth('[{"State":"running"}]')).toBe('healthy');
  });

  it('treats a created-but-not-running container without a healthcheck as starting', () => {
    expect(parseComposeHealth('[{"Health":"","State":"created"}]')).toBe('starting');
  });

  it('treats a record with neither health nor state as starting', () => {
    expect(parseComposeHealth('[{"Health":""}]')).toBe('starting');
  });

  it('reports an absent container for empty output', () => {
    expect(parseComposeHealth('   \n')).toBe('absent');
  });

  it('reports unknown for output it cannot parse', () => {
    expect(parseComposeHealth('not json at all')).toBe('unknown');
  });

  it('reports unknown when only some NDJSON lines are valid', () => {
    expect(parseComposeHealth('{"Health":"healthy"}\nnot json\n')).toBe('unknown');
  });
});

describe('formatStep', () => {
  it('marks a step that ran and appends its detail', () => {
    expect(formatStep({ name: 'Install', status: RAN, detail: 'npm install' })).toBe(
      '✔ Install (ran) — npm install',
    );
  });

  it('marks a skipped step', () => {
    expect(formatStep({ name: 'Configure', status: SKIPPED, detail: 'already there' })).toBe(
      '↷ Configure (skipped) — already there',
    );
  });

  it('marks a warned step', () => {
    expect(formatStep({ name: 'Configure', status: WARNED, detail: 'missing X' })).toBe(
      '! Configure (warned) — missing X',
    );
  });

  it('marks a failed step', () => {
    expect(formatStep({ name: 'Preflight', status: FAILED, detail: 'no docker' })).toBe(
      '✖ Preflight (failed) — no docker',
    );
  });

  it('omits the detail suffix when there is no detail', () => {
    expect(formatStep({ name: 'Seed', status: RAN })).toBe('✔ Seed (ran)');
  });

  it('falls back to a neutral mark for an unrecognized status', () => {
    expect(formatStep({ name: 'Odd', status: 'pending' })).toBe('· Odd (pending)');
  });
});

describe('formatSummary', () => {
  it('tallies the statuses and points at npm run dev on success', () => {
    const lines = formatSummary([
      { name: 'a', status: RAN },
      { name: 'b', status: SKIPPED },
      { name: 'c', status: SKIPPED },
      { name: 'd', status: WARNED },
    ]);

    expect(lines).toContain('Setup finished: 1 ran, 2 skipped, 1 warned, 0 failed.');
    expect(lines).toContain('  npm run dev');
    expect(lines.join('\n')).toContain('http://localhost:3000/admin');
  });

  it('tells the developer to re-run setup when a step failed', () => {
    const lines = formatSummary([
      { name: 'a', status: RAN },
      { name: 'b', status: FAILED },
    ]);

    expect(lines).toContain('Setup finished: 1 ran, 0 skipped, 0 warned, 1 failed.');
    expect(lines.join('\n')).toContain('run `npm run setup` again');
    expect(lines.join('\n')).not.toContain('npm run dev');
  });
});
