import type { EntityManager, MikroORM } from '@devmentor/db';
import type { AppEnv } from '../config/env';
import type { Logger } from '../logger';
import type { UserService } from '../services/user.service';

/**
 * The typed shape of everything registered in the awilix container. Resolving any
 * key off `container.cradle` (or an injected `{ ... }: Cradle` in a constructor) is
 * type-checked against this interface end to end.
 *
 * Lifetimes:
 * - `env`, `logger`, `orm` — SINGLETON (shared for the process).
 * - `em`, `userService` — SCOPED (created fresh per request scope).
 */
export interface Cradle {
  env: AppEnv;
  logger: Logger;
  orm: MikroORM;
  em: EntityManager;
  userService: UserService;
}
