import { MikroORM } from '@mikro-orm/postgresql';
import { createOrmConfig } from './config';

/**
 * Lazily-initialised singleton ORM. Cached on `globalThis` so Next.js hot-reload in
 * development reuses one ORM (and one connection pool) instead of leaking a new pool
 * on every module reload.
 *
 * In MikroORM v7 `MikroORM.init` only discovers metadata — it does not connect — so
 * `getOrm()` explicitly opens the connection. A failed connection (DB down) is NOT
 * cached: the cache entry is cleared so a later request retries, while the current
 * caller still sees the rejection and can degrade gracefully.
 */
const globalForOrm = globalThis as unknown as {
  __devmentorOrm?: Promise<MikroORM>;
};

export function getOrm(): Promise<MikroORM> {
  if (!globalForOrm.__devmentorOrm) {
    const pending = (async () => {
      const orm = await MikroORM.init(createOrmConfig());
      await orm.connect();
      return orm;
    })();
    pending.catch(() => {
      if (globalForOrm.__devmentorOrm === pending) {
        globalForOrm.__devmentorOrm = undefined;
      }
    });
    globalForOrm.__devmentorOrm = pending;
  }
  return globalForOrm.__devmentorOrm;
}

/** Report whether the database is reachable, without throwing. */
export async function checkDbConnection(): Promise<
  { ok: true } | { ok: false; reason: string }
> {
  try {
    const orm = await getOrm();
    const result = await orm.checkConnection();
    return result.ok ? { ok: true } : { ok: false, reason: result.reason };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

/** Close the ORM and its pool. Intended for graceful shutdown / test teardown. */
export async function closeOrm(): Promise<void> {
  if (globalForOrm.__devmentorOrm) {
    const orm = await globalForOrm.__devmentorOrm;
    await orm.close(true);
    globalForOrm.__devmentorOrm = undefined;
  }
}

export { MikroORM };
export type { EntityManager } from '@mikro-orm/postgresql';
