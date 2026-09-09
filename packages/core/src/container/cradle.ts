import type { EntityManager, MikroORM } from '@devmentor/db';
import type { AppEnv } from '../config/env';
import type { Logger } from '../logger';
import type { EventBus } from '../events/event-bus';
import type { Clock } from '../time/clock';
import type { SessionService } from '../services/auth/session.service';
import type { TokenService } from '../services/auth/token.service';
import type { UserService } from '../services/auth/user.service';
import type { Session } from '../http/auth';

/**
 * The typed shape of everything registered in the awilix container. Resolving any
 * key off `container.cradle` (or an injected `{ ... }: Cradle` in a constructor) is
 * type-checked against this interface end to end.
 *
 * Lifetimes:
 * - `env`, `logger`, `orm`, `eventBus`, `clock`, `sessionService`, `tokenService` —
 *   SINGLETON (shared for the process).
 * - `em`, `userService`, `sessionCookie`, `session` — SCOPED (created fresh per request
 *   scope).
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
  sessionService: SessionService;
  tokenService: TokenService;
  em: EntityManager;
  userService: UserService;
  /**
   * The raw, still-unverified session cookie this scope was opened for, or `null` when it
   * was not opened for a request at all (`withScope`, i.e. system work). Registered by
   * `withRequestScope`/`withCookieScope`; it is an input to `session`, never an
   * authorization answer in its own right.
   */
  sessionCookie: string | null;
  /**
   * The authenticated caller for this scope, or `null` — resolved **lazily and once**.
   *
   * A promise rather than a `Session` because resolving it verifies a signature and reads
   * the database; awilix caches this key per scope, so a route guard and a service that
   * both await it share a single `findOne(User)`.
   *
   * It answers `null` rather than throwing when there is no valid session, so a public
   * route may resolve it freely and **failing closed stays the caller's explicit
   * decision** — `requireSession` for a route, `requirePageSession` for a page.
   */
  session: Promise<Session | null>;
}
