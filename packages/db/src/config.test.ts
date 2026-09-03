import { afterEach, describe, expect, it, vi } from 'vitest';

const originalEnv = { ...process.env };

/**
 * `createOrmConfig` reads the environment through `getDbEnv`, which caches its parsed
 * result at module scope — so each case needs a fresh module graph.
 */
async function loadOrmConfig() {
  vi.resetModules();
  const { createOrmConfig } = await import('./config');
  return createOrmConfig();
}

describe('createOrmConfig', () => {
  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it('connects through DATABASE_URL when one is configured', async () => {
    process.env.DATABASE_URL = 'postgres://user:secret@db.example.com:6543/devmentor';

    const config = await loadOrmConfig();

    expect(config.clientUrl).toBe('postgres://user:secret@db.example.com:6543/devmentor');
    expect(config.host).toBeUndefined();
  });

  it('assembles a discrete connection when DATABASE_URL is absent', async () => {
    delete process.env.DATABASE_URL;
    process.env.DB_HOST = 'db.internal';
    process.env.DB_PORT = '6000';
    process.env.DB_NAME = 'devmentor_x';
    process.env.DB_USER = 'someone';
    process.env.DB_PASSWORD = 'secret';

    const config = await loadOrmConfig();

    expect(config.clientUrl).toBeUndefined();
    expect(config.host).toBe('db.internal');
    expect(config.port).toBe(6000);
    expect(config.dbName).toBe('devmentor_x');
    expect(config.user).toBe('someone');
  });

  it('keeps the migration snapshot name independent of the database name', async () => {
    const config = await loadOrmConfig();

    expect(config.migrations?.snapshotName).toBe('devmentor');
  });

  it('excludes colocated unit tests from the seeder glob', async () => {
    // Regression guard: MikroORM's default seeder glob imports every TS file in the
    // seeder directory, so a colocated `*.test.ts` broke `npm run db:seed` outright.
    const config = await loadOrmConfig();

    expect(config.seeder?.glob).toBe('!(*.d|*.test).{js,ts}');
  });
});
