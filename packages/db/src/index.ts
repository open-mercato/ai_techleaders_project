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
