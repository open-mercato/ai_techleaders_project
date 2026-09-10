import { z } from 'zod';

/**
 * Database environment schema. This is the *only* place in the `db` package that
 * reads `process.env`. `core` re-exports a superset schema for the rest of the app;
 * `db` keeps its own minimal copy so the MikroORM CLI can load config without pulling
 * in `core`.
 */
const dbEnvSchema = z.object({
  DATABASE_URL: z.string().url().optional(),
  DB_HOST: z.string().default('127.0.0.1'),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_NAME: z.string().default('devmentor'),
  DB_USER: z.string().default('devmentor'),
  DB_PASSWORD: z.string().default('devmentor'),
  DB_POOL_MIN: z.coerce.number().int().nonnegative().default(2),
  DB_POOL_MAX: z.coerce.number().int().positive().default(10),
  DB_POOL_IDLE_MS: z.coerce.number().int().positive().default(30_000),
  DB_DEBUG: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
  /**
   * Whether the Migrator may write `migrations/devmentor.json`. On by default — that
   * snapshot is a committed artifact `migration:create` diffs against — and turned off
   * for throwaway databases, which must never author a repository file.
   *
   * **Why this is not MikroORM's own `MIKRO_ORM_MIGRATIONS_SNAPSHOT`.** MikroORM v7 does
   * read that variable (`@mikro-orm/core/utils/env-vars.js`), but `MikroORM`'s constructor
   * merges it as `Utils.merge(env, options)` unless `preferEnvVars` is set — so anything
   * `config.ts` states explicitly *wins over the environment*. With `snapshot` pinned in
   * config, the MikroORM-native variable is silently inert (verified against the installed
   * 7.1.14). Rather than unpin the whole `migrations` block, or flip `preferEnvVars` and
   * make every MikroORM variable outrank our zod config, the one toggle we actually want
   * is declared here and consumed by `createOrmConfig`.
   */
  DB_MIGRATIONS_SNAPSHOT: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
});

export type DbEnv = z.infer<typeof dbEnvSchema>;

let cached: DbEnv | undefined;

/** Parse and cache the database-relevant environment. */
export function getDbEnv(env: NodeJS.ProcessEnv = process.env): DbEnv {
  if (!cached) {
    cached = dbEnvSchema.parse(env);
  }
  return cached;
}
