import { describe, expect, it, vi } from 'vitest';
import { getDbEnv } from './env';

/**
 * `getDbEnv` caches its first parse at module scope, so every case that needs a *fresh*
 * parse re-imports the module. `vi.resetModules()` is cheap here: `env.ts` imports zod
 * and nothing else.
 */
async function freshGetDbEnv(): Promise<typeof getDbEnv> {
  vi.resetModules();
  return (await import('./env')).getDbEnv;
}

/**
 * `NodeJS.ProcessEnv` is globally augmented by Next to make `NODE_ENV` required, so the
 * empty-environment case — the one the defaults exist for — does not typecheck without
 * this. See the 2026-09-09 lesson.
 */
const asEnv = (env: Record<string, string | undefined>) => env as NodeJS.ProcessEnv;

describe('getDbEnv', () => {
  it('applies every default when the environment is empty', async () => {
    const parse = await freshGetDbEnv();

    expect(parse(asEnv({}))).toEqual({
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
      DB_MIGRATIONS_SNAPSHOT: true,
    });
  });

  it('coerces the numeric vars, which arrive as strings', async () => {
    const parse = await freshGetDbEnv();

    const env = parse(
      asEnv({ DB_PORT: '6543', DB_POOL_MIN: '0', DB_POOL_MAX: '5', DB_POOL_IDLE_MS: '1000' }),
    );

    expect(env.DB_PORT).toBe(6543);
    expect(env.DB_POOL_MIN).toBe(0);
    expect(env.DB_POOL_MAX).toBe(5);
    expect(env.DB_POOL_IDLE_MS).toBe(1_000);
  });

  it('turns the two "true"/"false" flags into booleans', async () => {
    const parse = await freshGetDbEnv();

    expect(parse(asEnv({ DB_DEBUG: 'true', DB_MIGRATIONS_SNAPSHOT: 'false' }))).toMatchObject({
      DB_DEBUG: true,
      DB_MIGRATIONS_SNAPSHOT: false,
    });
  });

  it('rejects a flag that is neither "true" nor "false", rather than guessing', async () => {
    // MikroORM's own parser treats `t` and `1` as true and everything else as false, so a
    // typo there silently disables a feature. This schema refuses instead.
    const parse = await freshGetDbEnv();

    expect(() => parse(asEnv({ DB_MIGRATIONS_SNAPSHOT: '1' }))).toThrow();
  });

  it('rejects a DATABASE_URL that is not a URL', async () => {
    const parse = await freshGetDbEnv();

    expect(() => parse(asEnv({ DATABASE_URL: 'not-a-url' }))).toThrow();
  });

  it('caches the first parse, so a later call ignores a changed environment', async () => {
    const parse = await freshGetDbEnv();
    parse(asEnv({ DB_NAME: 'first' }));

    expect(parse(asEnv({ DB_NAME: 'second' })).DB_NAME).toBe('first');
  });

  it('defaults to process.env when no environment is passed', async () => {
    const parse = await freshGetDbEnv();
    vi.stubEnv('DB_NAME', 'from_process_env');

    try {
      expect(parse().DB_NAME).toBe('from_process_env');
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
