import { z } from 'zod';

/**
 * Application-wide environment schema. This is the single source of truth for config
 * across the app — nothing outside `core` (and `db`'s own narrow copy) should read
 * `process.env` directly. Add new config here so it is validated once at boot.
 */
const appEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_NAME: z.string().default('DevMentor'),
  LOG_LEVEL: z
    .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
    .default('info'),

  // Database — mirrors packages/db `env.ts`. Kept here too so config validation is
  // centralised; `db` reads its own copy for CLI use without importing `core`.
  DATABASE_URL: z.string().url().optional(),
  DB_HOST: z.string().default('127.0.0.1'),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_NAME: z.string().default('devmentor'),
  DB_USER: z.string().default('devmentor'),
  DB_PASSWORD: z.string().default('devmentor'),
});

export type AppEnv = z.infer<typeof appEnvSchema>;

let cached: AppEnv | undefined;

/** Parse and cache the validated application environment. */
export function getEnv(env: NodeJS.ProcessEnv = process.env): AppEnv {
  if (!cached) {
    cached = appEnvSchema.parse(env);
  }
  return cached;
}
