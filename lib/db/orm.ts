import "server-only";

import { MikroORM } from "@mikro-orm/postgresql";
import type { EntityManager } from "@mikro-orm/postgresql";
import { createOrmConfig } from "./config";

// Next.js dev re-evaluates modules on every HMR pass. Without this cache each
// reload would open a fresh connection pool and exhaust Postgres.
const globalForOrm = globalThis as typeof globalThis & {
  __mikroOrmPromise?: Promise<MikroORM>;
};

export function getOrm(): Promise<MikroORM> {
  globalForOrm.__mikroOrmPromise ??= MikroORM.init(createOrmConfig()).catch(
    (err: unknown) => {
      // Clear the cache so a transient failure (container not up yet) does not
      // poison every later request with the same rejected promise.
      delete globalForOrm.__mikroOrmPromise;
      throw err;
    },
  );
  return globalForOrm.__mikroOrmPromise;
}

/**
 * A request-scoped EntityManager fork. Always fork: the root EM's identity map is
 * shared process-wide and would leak entities between concurrent requests.
 */
export async function getEm(): Promise<EntityManager> {
  const orm = await getOrm();
  return orm.em.fork();
}
