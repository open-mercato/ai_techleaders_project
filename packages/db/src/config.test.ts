import { describe, expect, it, vi } from 'vitest';
import type { DbEnv } from './env';

/**
 * A fully-populated environment, matching what `dbEnvSchema` produces once its
 * defaults are applied. Parsing and precedence are `env.ts`'s job; these cases are
 * about what `createOrmConfig` builds from an already-validated env.
 */
const BASE_ENV: DbEnv = {
  DATABASE_URL: undefined,
  DB_HOST: '127.0.0.1',
  DB_PORT: 5432,
  DB_NAME: 'devmentor',
  DB_USER: 'devmentor',
  DB_PASSWORD: 'devmentor',
  DB_POOL_MIN: 2,
  DB_POOL_MAX: 10,
  DB_POOL_IDLE_MS: 30_000,
  DB_DEBUG: false,
};

let current: DbEnv = BASE_ENV;

/**
 * Stubbing `getDbEnv` instead of writing `process.env` keeps each case independent of
 * the others and of the ambient environment. It also means the MikroORM module graph
 * is imported **once** for the whole file: the previous approach reset the module
 * registry per test, so every case re-imported `@mikro-orm/*` from cold and timed out
 * against the 5s default on a loaded machine.
 */
vi.mock('./env', () => ({ getDbEnv: () => current }));

// Imported dynamically so the mock factory above closes over an initialized `current`
// — `config.ts` evaluates `createOrmConfig()` at module scope for its default export.
const { createOrmConfig } = await import('./config');

/** @param overrides the env fields this case cares about */
function ormConfig(overrides: Partial<DbEnv> = {}) {
  current = { ...BASE_ENV, ...overrides };
  return createOrmConfig();
}

describe('createOrmConfig', () => {
  it('connects through DATABASE_URL when one is configured', () => {
    const config = ormConfig({
      DATABASE_URL: 'postgres://user:secret@db.example.com:6543/devmentor',
    });

    expect(config.clientUrl).toBe('postgres://user:secret@db.example.com:6543/devmentor');
    expect(config.host).toBeUndefined();
  });

  it('assembles a discrete connection when DATABASE_URL is absent', () => {
    const config = ormConfig({
      DB_HOST: 'db.internal',
      DB_PORT: 6000,
      DB_NAME: 'devmentor_x',
      DB_USER: 'someone',
      DB_PASSWORD: 'secret',
    });

    expect(config.clientUrl).toBeUndefined();
    expect(config.host).toBe('db.internal');
    expect(config.port).toBe(6000);
    expect(config.dbName).toBe('devmentor_x');
    expect(config.user).toBe('someone');
  });

  it('passes the pool settings through', () => {
    const config = ormConfig({ DB_POOL_MIN: 1, DB_POOL_MAX: 20, DB_POOL_IDLE_MS: 1_000 });

    expect(config.pool).toEqual({ min: 1, max: 20, idleTimeoutMillis: 1_000 });
  });

  it('keeps the migration snapshot name independent of the database name', () => {
    const config = ormConfig({ DB_NAME: 'something_else' });

    expect(config.migrations?.snapshotName).toBe('devmentor');
  });

  it('excludes colocated unit tests from the seeder glob', () => {
    // Regression guard: MikroORM's default seeder glob imports every TS file in the
    // seeder directory, so a colocated `*.test.ts` broke `npm run db:seed` outright.
    const config = ormConfig();

    expect(config.seeder?.glob).toBe('!(*.d|*.test).{js,ts}');
  });
});
