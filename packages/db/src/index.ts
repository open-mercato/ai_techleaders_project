export * from './entities/index';
export { createOrmConfig } from './config';
export { getOrm, closeOrm, checkDbConnection, MikroORM } from './orm';
export type { EntityManager } from './orm';
export { getDbEnv, type DbEnv } from './env';

/**
 * The seeded personas' password and its hash. Exported from the barrel rather than reached
 * through a deep path because two consumers outside this package need them and neither may
 * guess at the value: the integration harness types `SEED_PASSWORD` into the sign-in form,
 * and a unit test in `core` verifies `SEED_PASSWORD_HASH` with the real `PasswordService`,
 * which is the guard that keeps the seeded credential a credential the product accepts.
 * They come from their own module so importing `@devmentor/db` does not drag in
 * `@mikro-orm/seeder` and the `DatabaseSeeder` class along with them.
 */
export { SEED_PASSWORD, SEED_PASSWORD_HASH } from './seeders/seed-password';

// Re-export the MikroORM primitives the rest of the monorepo needs so that only
// `db` depends on `@mikro-orm/*` directly.
export {
  EntityRepository,
  LockMode,
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
