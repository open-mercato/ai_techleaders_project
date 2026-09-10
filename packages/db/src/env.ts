import { z } from 'zod';

const POSTGRES_INTEGER_MAX = 2_147_483_647;
const DEFAULT_PLATFORM_PRICE_BOUNDS =
  '{"25":{"minCents":9000,"maxCents":60000},"50":{"minCents":18000,"maxCents":120000}}';
const priceRangeSchema = z.object({
  minCents: z.number().int().positive().max(POSTGRES_INTEGER_MAX),
  maxCents: z.number().int().positive().max(POSTGRES_INTEGER_MAX),
}).strict().refine((range) => range.minCents <= range.maxCents, {
  message: 'minCents must not exceed maxCents',
});
const serializedPriceBoundsSchema = z.object({
  '25': priceRangeSchema,
  '50': priceRangeSchema,
}).strict();

function parsePlatformPriceBounds(raw: string, ctx: z.RefinementCtx) {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    ctx.addIssue({ code: 'custom', message: 'PLATFORM_PRICE_BOUNDS must be valid JSON' });
    return z.NEVER;
  }
  const parsed = serializedPriceBoundsSchema.safeParse(value);
  if (!parsed.success) {
    ctx.addIssue({ code: 'custom', message: 'PLATFORM_PRICE_BOUNDS has an invalid shape' });
    return z.NEVER;
  }
  return { p25: parsed.data['25'], p50: parsed.data['50'] };
}

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
  // Kept in step with the application schema. The CLI does not calculate these
  // deadlines, but validating one shared deployment environment must not give the
  // app and migration commands different answers about malformed values.
  INVITATION_TTL_DAYS: z.coerce.number().int().positive().default(14),
  MENTOR_PUBLISH_WINDOW_DAYS: z.coerce.number().int().positive().default(14),
  // Kept in step with the application schema even though the CLI only validates it.
  PLATFORM_CURRENCY: z.literal('PLN').default('PLN'),
  PLATFORM_PRICE_BOUNDS: z.string().max(256).default(DEFAULT_PLATFORM_PRICE_BOUNDS)
    .transform(parsePlatformPriceBounds),
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
