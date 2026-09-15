import type { EntityManager, MikroORM } from '@devmentor/db';
import type { AppEnv } from '../config/env';
import type { Logger } from '../logger';
import type { EventBus } from '../events/event-bus';
import type { Clock } from '../time/clock';
import type { EmailVerificationService } from '../services/auth/email-verification.service';
import type { PasswordService } from '../services/auth/password.service';
import type { SessionService } from '../services/auth/session.service';
import type { TokenService } from '../services/auth/token.service';
import type { UserService } from '../services/auth/user.service';
import type { SlotService } from '../services/availability/slot.service';
import type { BookingService } from '../services/bookings/booking.service';
import type { PaymentService } from '../services/payments/payment.service';
import type { NotificationService } from '../services/notifications/notification.service';
import type { PayoutService } from '../services/payments/payout.service';
import type { TextSessionService } from '../services/sessions/text-session.service';
import type { InvitationService } from '../services/invitations/invitation.service';
import type { MentorProfileService } from '../services/mentors/mentor-profile.service';
import type { PlatformSettingsService } from '../services/operator/platform-settings.service';
import type { GithubIdentityPort } from '../services/auth/github-identity.port';
import type { Mailer } from '../services/notifications/mailer.port';
import type { PaymentGateway } from '../services/payments/payment-gateway.port';
import type { Session } from '../http/auth';
import type { RateLimiter } from '../http/rate-limit';

/**
 * The typed shape of everything registered in the awilix container. Resolving any
 * key off `container.cradle` (or an injected `{ ... }: Cradle` in a constructor) is
 * type-checked against this interface end to end.
 *
 * Lifetimes:
 * - `env`, `logger`, `orm`, `eventBus`, `clock`, `sessionService`, `tokenService`,
 *   `passwordService`, `githubIdentity`, `mailer` — SINGLETON (shared for the process).
 * - `em`, `userService`, `emailVerificationService`, `rateLimiter`, `sessionCookie`,
 *   `session` — SCOPED (created fresh per request scope).
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
  /**
   * Password hashing (B9). **Its concurrency gate is the reason this key is a
   * SINGLETON**: the gate counts hashes in flight for the whole process, and a scoped
   * or transient registration would give every request a private counter set to zero —
   * a limit of 2 would then admit 2 hashes *per request*, which is no limit at all.
   */
  passwordService: PasswordService;
  /**
   * The GitHub OAuth seam (B14). Which adapter answers here is the *only* difference
   * between a normal process and an integration run — the routes have no test branch.
   * See `container.ts` for the two-signal selection rule.
   */
  githubIdentity: GithubIdentityPort;
  /**
   * The outbound-email seam (B14). Resolving `send` and awaiting it is the whole contract:
   * it settles only when the provider accepted the message, which is what lets registration
   * fail closed rather than report success for a link nobody received (edge case 29). Which
   * adapter answers is `container.ts`'s decision — see `selectMailer`.
   */
  mailer: Mailer;
  /**
   * The payment seam (D04). Which adapter answers is `container.ts`'s decision — see
   * `selectPaymentGateway`. SINGLETON: the mock's in-memory sessions must outlive a
   * request, because a scenario creates a Checkout in one and simulates its webhook in the
   * next.
   */
  paymentGateway: PaymentGateway;
  em: EntityManager;
  userService: UserService;
  invitationService: InvitationService;
  mentorProfileService: MentorProfileService;
  slotService: SlotService;
  /**
   * Reservations (E03-S02). SCOPED for the same forced reason as every other service
   * holding `em`: it writes inside a transaction with a slot row locked, so it must use
   * the request's own fork rather than the first request's.
   */
  bookingService: BookingService;
  /**
   * Payments (E03-S03). SCOPED because it holds `em`; the gateway it depends on is a
   * process singleton reached through this scope.
   */
  paymentService: PaymentService;
  /**
   * In-product notifications and their best-effort email (E03-S04). SCOPED because it holds
   * `em`; the `bookings.booking.confirmed` subscriber therefore opens its own scope rather
   * than closing over the emitting request's.
   */
  notificationService: NotificationService;
  /**
   * Mentor payouts (E03-S06). SCOPED because it holds `em`; the run is triggered by an
   * operator request or by the `payouts:run` script, both of which open their own scope.
   */
  payoutService: PayoutService;
  /**
   * The text session of a confirmed booking (E04-S01). SCOPED because it holds `em`, and
   * because it resolves the caller's own `session` to answer the party question — the one
   * thing a route guard cannot ask, since both sides of one booking use the same screen.
   *
   * Deliberately **not** `sessionService`: that key is the auth service that issues the
   * sign-in cookie. Two different meanings of "session" on one cradle would be a bug waiting
   * for whoever autocompletes the wrong one.
   */
  textSessionService: TextSessionService;
  platformSettingsService: PlatformSettingsService;
  /**
   * Email verification (Slice 4). **SCOPED because it holds `em`** — it writes
   * `email_verified_at` — exactly like `userService`, and for the same forced reason: a
   * singleton would capture the first request's EntityManager. Its other dependencies
   * (`tokenService`, `mailer`, `env`, `clock`, `logger`) are process singletons and are
   * shared through this scope rather than rebuilt.
   */
  emailVerificationService: EmailVerificationService;
  /**
   * Brute-force rate limiting (B8). **SCOPED because it holds `em`**, not because it holds
   * per-request state — it holds none. The counters are rows in `auth_rate_limits`, which
   * is what makes one limit apply across process restarts and across every running
   * instance, and it is the opposite of `passwordService`'s in-memory gate for exactly
   * that reason.
   */
  rateLimiter: RateLimiter;
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
