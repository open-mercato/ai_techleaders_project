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
