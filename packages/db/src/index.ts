export * from './entities/index';
export { createOrmConfig } from './config';
export { getOrm, closeOrm, checkDbConnection, MikroORM } from './orm';
export type { EntityManager } from './orm';
export { getDbEnv, type DbEnv } from './env';

// Re-export the MikroORM primitives the rest of the monorepo needs so that only
// `db` depends on `@mikro-orm/*` directly.
export {
  EntityRepository,
  type FilterQuery,
  type Loaded,
  type RequiredEntityData,
} from '@mikro-orm/core';

/**
 * The driver-neutral wrapper MikroORM raises for a `23505` unique violation. Exported
 * because a check-then-write that races (platform primitives B10) can only tell "someone
 * else won" from "this is a bug" by the exception type plus the constraint name, and the
 * service that owns the recovery lookup lives in `core`. The original `pg` error's own
 * properties — including `constraint` — are copied onto the wrapper by `DriverException`,
 * so the constraint name survives the translation.
 */
export { UniqueConstraintViolationException } from '@mikro-orm/core';
