import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig } from '@mikro-orm/postgresql';
import { Migrator } from '@mikro-orm/migrations';
import { SeedManager } from '@mikro-orm/seeder';
import { entities } from './entities/index';
import { getDbEnv } from './env';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Build the MikroORM configuration from validated environment. Used by both the
 * runtime (`core` boots the ORM from this) and the MikroORM CLI (via
 * `mikro-orm.config.ts`). Prefers `DATABASE_URL` when present, otherwise assembles a
 * connection from discrete `DB_*` vars. Connection pooling is configured explicitly.
 */
export function createOrmConfig() {
  const env = getDbEnv();

  const connection = env.DATABASE_URL
    ? { clientUrl: env.DATABASE_URL }
    : {
        host: env.DB_HOST,
        port: env.DB_PORT,
        dbName: env.DB_NAME,
        user: env.DB_USER,
        password: env.DB_PASSWORD,
      };

  return defineConfig({
    ...connection,
    entities,
    extensions: [Migrator, SeedManager],
    debug: env.DB_DEBUG,
    pool: {
      min: env.DB_POOL_MIN,
      max: env.DB_POOL_MAX,
      idleTimeoutMillis: env.DB_POOL_IDLE_MS,
    },
    migrations: {
      path: resolve(packageRoot, 'migrations'),
      pathTs: resolve(packageRoot, 'migrations'),
      snapshot: true,
      // Fixed name so the snapshot file is deterministic regardless of the connected
      // database name (which may come from DATABASE_URL and vary per environment).
      snapshotName: 'devmentor',
      transactional: true,
      emit: 'ts',
    },
    seeder: {
      path: resolve(packageRoot, 'src', 'seeders'),
      pathTs: resolve(packageRoot, 'src', 'seeders'),
      defaultSeeder: 'DatabaseSeeder',
      emit: 'ts',
    },
  });
}

export default createOrmConfig();
