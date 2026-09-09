import type { EntityManager, MikroORM } from '@devmentor/db';
import type { AppEnv } from '../config/env';
import type { Logger } from '../logger';
import type { EventBus } from '../events/event-bus';
import type { Clock } from '../time/clock';
import type { TokenService } from '../services/auth/token.service';
import type { UserService } from '../services/auth/user.service';

/**
 * The typed shape of everything registered in the awilix container. Resolving any
 * key off `container.cradle` (or an injected `{ ... }: Cradle` in a constructor) is
 * type-checked against this interface end to end.
 *
 * Lifetimes:
 * - `env`, `logger`, `orm`, `eventBus`, `clock`, `tokenService` — SINGLETON (shared
 *   for the process).
 * - `em`, `userService` — SCOPED (created fresh per request scope).
 *
 * As services grow to ~9 concepts, each new one is a new explicit line here and in
 * `container.ts` — never auto-discovered from a folder scan.
 */
export interface Cradle {
  env: AppEnv;
  logger: Logger;
  orm: MikroORM;
  eventBus: EventBus;
  clock: Clock;
  tokenService: TokenService;
  em: EntityManager;
  userService: UserService;
}
