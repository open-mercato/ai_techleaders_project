import {
  UniqueConstraintViolationException,
  User,
  type EntityManager,
  type IUser,
  type Role,
} from '@devmentor/db';
import type { AppEnv } from '../../config/env';
import type { Logger } from '../../logger';
import type { Clock } from '../../time/clock';
import type { EventBus } from '../../events/event-bus';
import type { EventMap } from '../../events/event-map';
import { requireRole, type Session } from '../../http/auth';
import { ConflictError, NotFoundError, UnauthorizedError } from '../../http/errors';
import {
  rateLimitKey,
  REGISTRATION_IP_POLICY,
  SIGN_IN_EMAIL_POLICY,
  SIGN_IN_IP_POLICY,
  type RateLimiter,
} from '../../http/rate-limit';
import type { EmailVerificationService } from './email-verification.service';
import type { PasswordService } from './password.service';
import { normalizeRoles, resolveLiveRoles } from './operator-authority';

/**
 * Plain, JSON-safe shape a user is exposed as over the API. Services own their output
 * shape (SRP) and return DTOs rather than ORM entities, so routes never risk
 * serializing a bidirectional relation cycle.
 *
 * The four identity columns E01 adds are **deliberately not all here**. `roles`,
 * `githubLogin` and `avatarUrl` are; `passwordHash`, `emailVerifiedAt`, `sessionVersion`
 * and `githubId` never are. Two of those are secrets, and the other two are internal
 * state whose only legitimate consumers are the guard (`session_version`) and the linking
 * rule (`email_verified_at`) — both of which read the row, not a DTO.
 */
export interface UserDto {
  id: string;
  email: string;
  displayName: string;
  /**
   * The role set as it stands after any live reconciliation this call performed. Ordered
   * by `ROLES` and duplicate-free (`normalizeRoles`), so two DTOs for equal membership
   * compare equal.
   */
  roles: readonly Role[];
  githubLogin: string | null;
  avatarUrl: string | null;
  createdAt: string;
  mentorProfile: { id: string; headline: string } | null;
}

/**
 * A user plus the single field a caller needs in order to issue — or **re-issue** — their
 * session cookie.
 *
 * `sessionVersion` rides alongside the DTO rather than inside it because it is server-only
 * state that must never be serialized to a client, yet the two callers that change it need
 * to know the new value in the same request. That is the whole point: `grantRole` and
 * `revokeRole` bump the column, which invalidates every token the caller is currently
 * holding, so **the route must sign a fresh cookie from this value before it responds**.
 * Only a route handler can set a cookie in the App Router (2026-09-08 lesson), so a
 * service cannot do it and a page must never try.
 */
export interface SignedInUser {
  user: UserDto;
  sessionVersion: number;
}

/**
 * Everything `create` is allowed to decide about a new account — and, by construction,
 * nothing else.
 *
 * Declared here rather than inferred from a Zod schema, and consumed field by field in
 * `create` rather than spread into `em.create`, because `users` now carries `roles`,
 * `emailVerifiedAt`, `sessionVersion` and `githubId`. A spread makes the method a
 * mass-assignment surface whose safety depends on whatever the *caller* validated with:
 * TypeScript's excess-property check only fires on object literals, so a widened object
 * reaching this signature would carry its extra keys straight into the entity. Naming the
 * two writable fields at the `em.create` call site removes that surface from the method
 * instead of delegating it to a schema (edge case 4 / Slice 2 "Breaking changes" 3).
 *
 * `roles`, `emailVerifiedAt` and every identity column are therefore *not* here. A row
 * made by this method is a `['mentee']` (the column default), unverified account with no
 * provider identity, which is exactly what Slice 4's password registration needs.
 */
export interface UserCreateInput {
  email: string;
  displayName: string;
}

/**
 * What `findOrCreateFromGithub` needs from an already-verified GitHub identity.
 *
 * Declared here, by the consumer, rather than imported from the identity port: the port
 * and its adapters are a separate step, `core` services do not depend on adapters, and a
 * structural input keeps this method testable without one. The port's identity type
 * satisfies this shape.
 *
 * `email` is required and is understood to be GitHub's **primary verified** address — the
 * adapter refuses an identity without one (edge case 3), so this method never has to
 * decide whether an unverified provider address counts.
 */
export interface GithubIdentityInput {
  githubId: string;
  githubLogin: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
}

/**
 * Everything `registerWithPassword` is allowed to decide, and — like `UserCreateInput` —
 * nothing else. `roles`, `emailVerifiedAt`, `sessionVersion` and every identity column are
 * deliberately absent: a registration always produces a `['mentee']`, unverified row with
 * no provider identity, whatever the caller sends.
 *
 * `clientIp` is `string | null` rather than optional because "we could not derive one" is
 * an answer the caller has to have made (edge case 17b), not a field it may forget.
 * `clientIpFromHeaders` produces exactly this type, `rateLimitKey` turns `null` into a
 * `null` key, and `RateLimiter.consume` treats that as "no bucket to charge" — so the
 * per-IP limit degrades to "off" and the request is still limited by everything else.
 */
export interface RegisterWithPasswordInput {
  email: string;
  password: string;
  displayName: string;
  /** Where the browser should land once the verification link is opened. */
  returnTo?: string | null;
  /** The client IP for the per-IP registration bucket, or `null` when none is derivable. */
  clientIp: string | null;
}

/**
 * What a successful registration reports, and the shape of the whole answer: the address a
 * verification link was sent to.
 *
 * **There is no `UserDto` here and no `sessionVersion`, and that absence is the contract.**
 * Registration never signs anybody in — `email_verified_at` is what gates sign-in, so a
 * caller that returned a `SignedInUser` from this method would be handing out a session for
 * an address nobody has proven. `EmailVerificationService.verify` is the only thing in the
 * system that turns a registration into a session, and it returns the material to do it.
 * The route answers `{ ok: true, data: { email } }` from this and sets no cookie.
 */
export interface RegistrationOutcome {
  email: string;
}

/** Everything `authenticateWithPassword` needs. `clientIp` on the same terms as above. */
export interface AuthenticateWithPasswordInput {
  email: string;
  password: string;
  clientIp: string | null;
}

/**
 * **The one refusal a failed sign-in ever produces**, for an address that has no account,
 * an address whose account is GitHub-only, and a password that does not match alike.
 *
 * A constant rather than three call-site literals, because the property the spec asks for
 * (edge case 13) is that the messages are *byte-identical*: two literals that read the same
 * today are two things a later edit can make different, and the difference is an oracle for
 * "that address is registered here". There is one string, and `user.service.test.ts`
 * compares the two refusals to each other — not each to a literal — so a change that
 * splits them fails a test rather than shipping.
 *
 * The wording follows this repo's copy rule — direct, and it says what to do — rather than
 * the spec's shorthand *"Invalid credentials"*. What the spec pins is that one message
 * covers every failure; the words themselves are the design system's business, and
 * "Invalid credentials" tells a person who mistyped their password nothing they can act on.
 *
 * It is exported so the integration scenario can assert the rendered text without copying
 * it, on the same reasoning as `RATE_LIMITED_MESSAGE`.
 */
export const INVALID_CREDENTIALS_MESSAGE =
  'That email address and password do not match an account. Check both and try again.';

/**
 * The refusal for a correct password on an address nobody has confirmed yet (edge case 15).
 *
 * **This is not a hole in the generic-login rule, and the distinction is worth being precise
 * about.** That rule exists so that a *failed credential check* cannot be attributed: an
 * unknown address and a wrong password must be indistinguishable, or the sign-in form is an
 * account enumerator. This message is only ever reached **after** the credential check has
 * already succeeded, so it partitions nothing an attacker could not learn by simply signing
 * in. Someone who can see it has already proved they hold the password.
 *
 * It is therefore specific on purpose, because the person reading it can act on it: they
 * hold the link, and if it has expired, registering the same address again re-claims the row
 * and sends a fresh one (the last two rows of the state matrix).
 */
export const EMAIL_NOT_VERIFIED_MESSAGE =
  'Confirm your email address before signing in. Open the link sent when this account was ' +
  'registered, or register again with the same address to get a new one.';

/**
 * Said to someone registering an address that already has a usable account.
 *
 * Deliberately generic about *which* kind of account, unlike the GitHub message below: a
 * verified row with a password is reachable by signing in, so naming anything more about it
 * would widen the recorded oracle without helping the user do anything differently.
 */
export const ACCOUNT_EXISTS_MESSAGE =
  'An account already exists for this email address. Sign in with it instead.';

/**
 * Said to someone registering an address that belongs to a GitHub-only account — a row with
 * `github_id` set and `password_hash` null (edge case 14).
 *
 * **This is the spec's one recorded deviation from "never reveal whether an email is
 * registered", and it is a trade rather than an oversight** ("A deliberate deviation from
 * the standards spec"). It is a precise oracle for "this address has a GitHub account here".
 * The alternative was weighed: refusing generically leaves a user who cannot sign in, cannot
 * register, and is told nothing that would let them work out why. The oracle is confined to
 * the register path — which is rate-limited per IP — and **login stays strictly generic**;
 * see `INVALID_CREDENTIALS_MESSAGE`, which covers a GitHub-only account too. Revisit at the
 * 2026-11-28 retrospective.
 */
export const GITHUB_ACCOUNT_MESSAGE =
  'This email address is already registered through GitHub. Use "Sign in with GitHub" ' +
  'instead of a password.';

/**
 * The two unique constraints a *concurrent identical sign-in* can lose on, and nothing
 * else. Named rather than inferred from "any unique violation": `mentor_profiles_user_id_unique`
 * is also a unique violation and is unambiguously a bug, so hiding it behind a retry would
 * turn a defect into a silent second round trip (primitives B10).
 */
const IDENTITY_CONSTRAINTS = new Set(['users_email_unique', 'users_github_id_unique']);

/**
 * The name of the identity constraint this error lost on, or `null` if the error is not a
 * lost race at all.
 *
 * The `constraint` property is the original `pg` error's, copied onto MikroORM's wrapper by
 * `DriverException`'s constructor. A wrapper without one cannot be attributed to a
 * particular constraint, so it is treated as unexpected and rethrown — guessing would be
 * how an unrelated violation gets retried into a wrong answer.
 */
function lostIdentityRace(error: unknown): string | null {
  if (!(error instanceof UniqueConstraintViolationException)) {
    return null;
  }
  const { constraint } = error as { constraint?: unknown };
  if (typeof constraint !== 'string' || !IDENTITY_CONSTRAINTS.has(constraint)) {
    return null;
  }
  return constraint;
}

/**
 * The refusing half of the registration state matrix: throw when the row already holding
 * this address is a usable account, return when it is claimable.
 *
 * The whole rule is `email_verified_at`. An unverified row — with or without a
 * `password_hash` — is claimable, because nobody has ever proved they own the address and
 * the claim grants nothing until somebody does. A verified row is an account, and there are
 * two of those:
 *
 * - `github_id` set and `password_hash` null is the GitHub-only account of edge case 14, and
 *   gets the pointed message. That ordering matters: a row with *both* is a password account
 *   that has linked GitHub, so it can be signed into with a password and gets the generic
 *   refusal instead.
 * - Anything else verified gets the generic refusal, including the degenerate row with
 *   neither credential — it is still somebody's account and this is not the method that
 *   repairs it.
 *
 * A separate function rather than an inline block because it runs twice: once on the first
 * lookup and again on the row re-read after a lost insert race, which is what stops a
 * recovered race from being a way around the matrix.
 */
function assertRegistrable(existing: IUser | null): void {
  if (existing === null || !existing.emailVerifiedAt) {
    return;
  }
  if (existing.githubId && !existing.passwordHash) {
    throw new ConflictError(GITHUB_ACCOUNT_MESSAGE);
  }
  throw new ConflictError(ACCOUNT_EXISTS_MESSAGE);
}

/** Whether two role sets hold the same membership, comparing canonical forms. */
function sameMembership(a: readonly Role[], b: readonly Role[]): boolean {
  const left = normalizeRoles(a);
  const right = normalizeRoles(b);
  return left.length === right.length && left.every((role, index) => role === right[index]);
}

/**
 * A row whose live role set is empty. Only reachable one way — the stored set was exactly
 * `['operator']` and the address is no longer allowlisted — and that row is corrupt: D19
 * gives every account a base role on top of which `operator` is granted, and the
 * `users_roles_non_empty` CHECK would reject the write anyway.
 *
 * A plain `Error`, not an `AppError`: this is a data bug for whoever owns the row to fix,
 * so it must be logged as an unexpected failure rather than reported to the caller as an
 * expected outcome they could act on. `http/auth.ts` refuses the same row on the request
 * path, for the same reason.
 */
function corruptRoleSetError(userId: string): Error {
  return new Error(
    `Reconciling user ${userId} derived an empty role set. The only stored role was the ` +
      'operator cache and the address is not allowlisted, so there is no base role to ' +
      'fall back to: repair the row rather than writing a set the CHECK constraint rejects.',
  );
}

function toUserDto(user: IUser): UserDto {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    roles: normalizeRoles(user.roles),
    // `?? null` rather than a bare read: a nullable column that was never set infers as
    // `string | null | undefined`, and `undefined` would vanish from the JSON envelope
    // instead of being reported as absent.
    githubLogin: user.githubLogin ?? null,
    avatarUrl: user.avatarUrl ?? null,
    createdAt: user.createdAt.toISOString(),
    mentorProfile: user.mentorProfile
      ? { id: user.mentorProfile.id, headline: user.mentorProfile.headline }
      : null,
  };
}

/** A `roles_changed` payload waiting for its transaction to commit, or nothing to say. */
type PendingRolesChange = EventMap['auth.user.roles_changed'] | null;

/** Everything one attempt at the GitHub sign-in produced, before anything is announced. */
interface GithubSignInOutcome {
  user: IUser;
  /**
   * Emissions deferred until the transaction has committed. A rolled-back attempt must not
   * have announced `auth.user.created` for a row that does not exist — which is exactly
   * what the losing side of the identity race is. Thunks rather than a tagged union so the
   * payload stays checked against `EventMap` at the push site.
   */
  announce: Array<() => Promise<void>>;
}

/**
 * Domain service for users. Constructor-injected by awilix (PROXY mode), so it
 * receives a request-scoped `em` (a forked EntityManager) plus the shared `logger`,
 * `eventBus`, `env` and `clock`. All persistence goes through the `em` — services never
 * touch `process.env` or the ORM singleton directly, and never build an HTTP response.
 */
export class UserService {
  private readonly em: EntityManager;
  private readonly logger: Logger;
  private readonly eventBus: EventBus;
  private readonly env: AppEnv;
  private readonly clock: Clock;
  private readonly session: Promise<Session | null>;
  private readonly passwordService: PasswordService;
  private readonly rateLimiter: RateLimiter;
  private readonly emailVerificationService: EmailVerificationService;

  constructor({
    em,
    logger,
    eventBus,
    env,
    clock,
    session,
    passwordService,
    rateLimiter,
    emailVerificationService,
  }: {
    em: EntityManager;
    logger: Logger;
    eventBus: EventBus;
    env: AppEnv;
    clock: Clock;
    session: Promise<Session | null>;
    passwordService: PasswordService;
    rateLimiter: RateLimiter;
    emailVerificationService: EmailVerificationService;
  }) {
    this.em = em;
    this.logger = logger;
    this.eventBus = eventBus;
    this.env = env;
    this.clock = clock;
    this.passwordService = passwordService;
    this.rateLimiter = rateLimiter;
    this.emailVerificationService = emailVerificationService;
    // A `Promise<Session | null>`, not a `Session`: the scoped `session` key is lazy and
    // awilix caches the promise, which is what keeps the guard and this service sharing a
    // single `findOne(User)`. Destructured synchronously with everything else — walking
    // the PROXY cradle after an `await` resolves against a scope that may already be
    // disposed.
    this.session = session;
    // Resolving the key here starts the lookup, so a rejection (a missing SESSION_SECRET,
    // or the corrupt role set of edge case 30b) would otherwise be unhandled for any
    // caller that never awaits it. This marks it handled without swallowing anything: the
    // rejection is still delivered to `await this.session` below.
    void session.catch(() => undefined);
  }

  /**
   * List every user, with their mentor profile eagerly populated.
   *
   * **Operator-only, and this check is the guarantee.** `/api/users` also denies in its
   * `authorize` hook, but that is defence in depth: a layout does not re-run on a
   * client-side navigation and a future caller may reach the service by another route, so
   * the authority sits next to the data (edge case 21). Anonymous is 401 and a mentee or
   * mentor is 403, matching `requireSession`/`requireRole` exactly — a caller who is signed
   * in learns that signing in again will not help.
   */
  async list(): Promise<UserDto[]> {
    await this.requireOperator();

    const users = await this.em.find(
      User,
      {},
      { populate: ['mentorProfile'], orderBy: { createdAt: 'desc' } },
    );
    return users.map(toUserDto);
  }

  async findByEmail(email: string): Promise<IUser | null> {
    return this.em.findOne(User, { email });
  }

  /**
   * Create and persist a user, then emit `auth.user.created`.
   *
   * **No route calls this in E01** — `POST /api/users` was removed with this slice, and
   * the GitHub path creates its row inside `findOrCreateFromGithub`'s transaction because
   * it must also set the identity columns. It is kept because Slice 4's
   * `registerWithPassword` is its next caller, and because the safe construction below is
   * the thing worth keeping: `em.create` receives an object literal naming the two
   * writable fields, so `roles`, `emailVerifiedAt`, `sessionVersion` and `githubId` cannot
   * be reached through this method whatever the caller passes.
   */
  async create(data: UserCreateInput): Promise<UserDto> {
    // The two writable fields are named again here rather than spread into `insertUser`:
    // a spread would carry a widened caller's extra keys as far as the helper, and the
    // guarantee this method documents is that they never get that far.
    const user = await this.insertUser({
      email: data.email,
      displayName: data.displayName,
      passwordHash: null,
    });
    return toUserDto(user);
  }

  /**
   * Register an account with an email address and a password, and send the verification
   * link that is the only thing able to turn it into a sign-in.
   *
   * **The full state matrix, which is what this method is** — five cases keyed on the row
   * that already holds the address:
   *
   * | Existing row | Answer |
   * |---|---|
   * | none | create `roles: ['mentee']`, `emailVerifiedAt` null, send verification |
   * | verified, has `password_hash` | 409, generic (`ACCOUNT_EXISTS_MESSAGE`) |
   * | verified, no password, has `github_id` | 409 pointing at GitHub (`GITHUB_ACCOUNT_MESSAGE`) |
   * | unverified, no `password_hash` | **claim**: write the hash, send verification |
   * | unverified, has a `password_hash` | **claim**: overwrite the hash, send verification |
   *
   * **The hash is written immediately, not held pending, and overwriting an unverified
   * row's hash grants the writer nothing.** `email_verified_at` is what gates sign-in, so
   * until somebody opens a link from the mail — which only the address's real owner
   * receives — the row cannot be signed in as, whatever its `password_hash` says. The
   * alternative, carrying the pending credential in the verification token's subject, was
   * considered and rejected: `signPurposeToken` produces a signed but *unencrypted* JWT
   * that travels in a URL, through a mail relay, into an inbox, which would put a password
   * hash outside the server against this spec's own sensitive-data rule.
   *
   * **The ordering is fixed and is what makes edge case 18 true** (primitives B8): the
   * hashing gate slot is acquired first — an in-memory check — the rate limit is consumed
   * second, and the hash runs third. `withSlot` rejects *before* it runs this callback, so
   * a 503 from a saturated gate cannot have touched the counter and an unrelated burst
   * cannot lock out users who were merely unlucky. The lookup sits between the counter and
   * the hash so that a 409 costs no scrypt run, and *after* the counter so that the 409
   * itself is charged for — an oracle that answered for free is an enumeration API.
   *
   * That does mean the slot is held across two database round trips (the counter and the
   * lookup) as well as the hash. B8 already puts the first of them inside the slot by
   * construction, the write has to follow the hash, and at five registrations per IP per
   * hour the extra hold is not what bounds throughput. The one call that would — outbound
   * mail, with its own multi-second timeout — is outside, below.
   *
   * **It fails closed on a delivery failure** (edge case 29): `sendVerificationLink`
   * rejects, nothing catches it, and the caller gets a retryable 503 rather than a success
   * for a link nobody received. That leaves a written row with a hash and no
   * `email_verified_at`, which is deliberate and safe — it is precisely the fourth/fifth
   * matrix row, it can be signed in as by nobody, and registering the same address again
   * re-claims it and sends a fresh link. The alternative, holding a database transaction
   * open across an outbound HTTP call with a ten-second timeout, trades a harmless row for
   * a held connection and a lock.
   */
  async registerWithPassword(input: RegisterWithPasswordInput): Promise<RegistrationOutcome> {
    const user = await this.passwordService.withSlot(async (work) => {
      await this.rateLimiter.consume(
        rateLimitKey('register', 'ip', input.clientIp),
        REGISTRATION_IP_POLICY,
      );

      const existing = await this.em.findOne(User, { email: input.email });
      assertRegistrable(existing);

      const passwordHash = await work.hash(input.password);
      return this.writeRegistration(existing, input, passwordHash);
    });

    // Outside the gate slot on purpose. Delivery is an outbound HTTP call with its own
    // timeout, and holding one of a handful of 128 MiB hashing slots for its duration
    // would make the mail provider's latency the app's sign-up concurrency limit.
    await this.emailVerificationService.sendVerificationLink({
      user,
      returnTo: input.returnTo,
    });

    return { email: user.email };
  }

  /**
   * Check an email address and password, and return the material for a session.
   *
   * **One refusal covers every failure** (edge case 13): an address with no account, an
   * address whose account is GitHub-only, and a wrong password all raise the same
   * `UnauthorizedError` carrying the same `INVALID_CREDENTIALS_MESSAGE` reference. Login is
   * strictly generic — the account-existence oracle the spec records as a deliberate trade
   * is confined to the register path.
   *
   * **The timing is not identical, and that is a decision rather than an omission.**
   * `PasswordService.verify` returns false immediately for a null stored hash, so an unknown
   * address (and a GitHub-only one) is refused without a scrypt run, and a stopwatch can
   * still tell the two apart. Hashing a decoy would close it, and was rejected where the
   * reasoning belongs, in `password.service.ts`: a decoy costs a gate slot and 128 MiB per
   * probe, so it converts a read-only enumeration attempt into the exact resource
   * amplification the gate exists to prevent — an enumerator would 503 real users. `verify`
   * is nevertheless called on the null hash rather than short-circuited, so there is one
   * refusal site and one message for all three cases, and what actually bounds enumeration
   * is the pair of counters consumed above (10/IP and 5/email per 15 minutes).
   *
   * **No session before `emailVerifiedAt`** (edge case 15) — see `EMAIL_NOT_VERIFIED_MESSAGE`
   * for why that refusal is allowed to be specific.
   *
   * The gate/limit/hash ordering is `registerWithPassword`'s, for the same reason. Both
   * counters are consumed before any credential work, so the count never depends on whether
   * the address exists or the password matched.
   *
   * **Roles are read from the row, not re-derived from `OPERATOR_EMAILS`.** The same choice
   * `EmailVerificationService.verify` documents: reconciling here would need a third copy of
   * the corrupt-empty-set check, and it would buy only that an allowlisted founder signing in
   * with a password lands on `/admin` instead of `/home` for one request. Authority is
   * unaffected — `requireSession` derives `operator` live on their very next request (D19).
   */
  async authenticateWithPassword(
    input: AuthenticateWithPasswordInput,
  ): Promise<SignedInUser> {
    const user = await this.passwordService.withSlot(async (work) => {
      await this.rateLimiter.consume(
        rateLimitKey('sign-in', 'ip', input.clientIp),
        SIGN_IN_IP_POLICY,
      );
      await this.rateLimiter.consume(
        rateLimitKey('sign-in', 'email', input.email),
        SIGN_IN_EMAIL_POLICY,
      );

      const candidate = await this.em.findOne(
        User,
        { email: input.email },
        { populate: ['mentorProfile'] },
      );
      const matched = await work.verify(input.password, candidate?.passwordHash ?? null);

      if (candidate === null || !matched) {
        // No address, no user id, no hash and no reason code that distinguishes the two
        // cases: the log line must not be the oracle the response refuses to be.
        this.logger.info('refused a password sign-in');
        throw new UnauthorizedError(INVALID_CREDENTIALS_MESSAGE);
      }
      return candidate;
    });

    // Outside the slot: the credential is already checked, so this decision needs no
    // hashing capacity.
    if (!user.emailVerifiedAt) {
      this.logger.info({ userId: user.id }, 'refused a sign-in for an unconfirmed address');
      throw new UnauthorizedError(EMAIL_NOT_VERIFIED_MESSAGE);
    }

    this.logger.info({ userId: user.id }, 'signed in with a password');
    return { user: toUserDto(user), sessionVersion: user.sessionVersion };
  }

  /**
   * Resolve a GitHub identity to the account that owns it, creating one if there is none.
   *
   * The matching order is fixed and is the whole security surface of GitHub sign-in:
   *
   * 1. **`github_id`** — the identity is already linked; nothing is claimed.
   * 2. **`email`, but only where `email_verified_at` is set** — link the identity onto
   *    that row. An email match on an *unverified* row is refused (see below).
   * 3. **Otherwise create** `{ roles: ['mentee'], emailVerifiedAt: now }`. The address
   *    arrives already proven by GitHub, so the new row is verified from birth.
   *
   * Everything runs inside one concept-owned transaction (primitives B10) because steps 1
   * to 3 are a check-then-write: without it, two callbacks can both read "no such user"
   * and both insert. With it, one of them loses on a unique constraint instead — which is
   * a recoverable outcome, handled here rather than by a generic helper, because the
   * recovery *is* the matching order above and only this method knows it.
   */
  async findOrCreateFromGithub(identity: GithubIdentityInput): Promise<SignedInUser> {
    let outcome: GithubSignInOutcome;
    try {
      outcome = await this.attemptGithubSignIn(identity);
    } catch (error) {
      const constraint = lostIdentityRace(error);
      if (constraint === null) {
        // Any other failure — a check violation, a not-null violation, a unique violation
        // on a constraint that has nothing to do with identity — is a bug or an outage.
        // Retrying it would hide it (edge case 9's second half).
        throw error;
      }

      // We lost the race: between our lookup and our INSERT, a concurrent callback for the
      // same person committed first. Re-running the *whole* attempt is what "re-run the
      // corresponding lookup" comes to, and it is stricter than re-running only the lookup
      // that failed: whichever constraint we lost on, the winner is now visible to step 1
      // or step 2, and step 2 still applies the verification rule to it. A second failure
      // is not retried — two consecutive losses are not a race, they are a defect.
      this.logger.info(
        { githubId: identity.githubId, constraint },
        'lost the GitHub identity race, re-reading the winner',
      );
      outcome = await this.attemptGithubSignIn(identity);
    }

    for (const emit of outcome.announce) {
      await emit();
    }

    return { user: toUserDto(outcome.user), sessionVersion: outcome.user.sessionVersion };
  }

  /**
   * Add a role, preserving every other role the user already holds, and bump
   * `session_version`.
   *
   * **The caller must re-issue the session cookie.** The bump invalidates every token that
   * user is holding, including the one on the request that triggered the grant, so a route
   * that commits this and redirects hands the user straight back to `/sign-in`. Use the
   * returned `sessionVersion` to sign a fresh cookie in the same response (2026-09-08
   * lesson). E01 ships no route or UI that calls this; it exists so that #15, invitation
   * acceptance, has a contract to build against.
   *
   * Granting `operator` writes only the queryability cache. Authority still comes live from
   * `OPERATOR_EMAILS` (D19), so the very next request — and the next reconciliation — will
   * strip it again unless the address is allowlisted. Adding a founder is an allowlist
   * commit, not a call to this method.
   *
   * Not wrapped in a transaction, unlike `findOrCreateFromGithub`: E01 exposes no path that
   * calls this, so there is nothing to race with yet, and B10 names exactly one E01
   * transaction. #15 adds the first caller — read-modify-write on `roles` and
   * `session_version` needs the row locked (or the version incremented in SQL) before two
   * concurrent invitation acceptances can exist.
   */
  async grantRole(userId: string, role: Role): Promise<SignedInUser> {
    return this.changeRoleMembership(userId, role, 'granted');
  }

  /**
   * Remove a role, preserving every other role the user holds, and bump `session_version`.
   * The re-issue obligation from `grantRole` applies identically.
   *
   * Refuses to remove the user's last role: `users_roles_non_empty` would reject the write
   * and D19 has no concept of a roleless account.
   */
  async revokeRole(userId: string, role: Role): Promise<SignedInUser> {
    return this.changeRoleMembership(userId, role, 'revoked');
  }

  /**
   * End every session this user holds, by bumping `session_version`.
   *
   * The sign-out half of the closed list of `session_version` triggers (the other is
   * `grantRole`/`revokeRole`). Bumping the column is what makes a *copied* cookie stop
   * working at sign-out rather than surviving for the rest of its 24 hours (edge case 11);
   * the cost, accepted in D19, is that signing out on one device signs the user out
   * everywhere, because there is one logical session per user.
   *
   * **Only called when a live session was actually presented.** `POST /api/auth/logout`
   * requires CSRF but not a session (edge case 27), so signing out with an expired or
   * tampered cookie clears the cookie and never reaches this method — there is no row to
   * attribute the bump to, and nothing to revoke.
   *
   * A missing row is not an error. The session was resolved from a `findOne` a moment ago,
   * so this is the vanishingly narrow window where the account was deleted in between; the
   * caller's cookie is being expired regardless and there is nothing left to revoke.
   *
   * Read-modify-write without a lock is deliberate. Two concurrent sign-outs may both read
   * `n` and both write `n + 1`, which is the correct answer either way: what has to hold is
   * that every token carrying `n` stops verifying, not that the counter reaches `n + 2`.
   */
  async endAllSessions(userId: string): Promise<void> {
    const user = await this.em.findOne(User, { id: userId });
    if (user === null) {
      return;
    }

    user.sessionVersion += 1;
    await this.em.flush();
    this.logger.info({ userId }, 'ended every session for a user');
  }

  /**
   * The scoped caller, or the matching refusal: `UnauthorizedError` (401) when nobody is
   * signed in, `ForbiddenError` (403) — from `requireRole` — when somebody is but holds no
   * `operator` role. The same two errors `requireSession` and `requireRole` produce at a
   * route, because a service-level refusal must not be distinguishable from a route-level
   * one by anything the caller can see.
   */
  private async requireOperator(): Promise<Session> {
    const session = await this.session;
    if (session === null) {
      throw new UnauthorizedError();
    }
    return requireRole(session, 'operator');
  }

  /**
   * Insert a row, announce it, and hand back the entity.
   *
   * The one construction site for a `users` row outside the GitHub flow, shared by `create`
   * and `registerWithPassword` so that "which columns may a new local account set" is
   * answered in exactly one place. `em.create` receives an object literal naming three
   * fields, so `roles`, `emailVerifiedAt`, `sessionVersion` and every identity column keep
   * their defaults — a `['mentee']`, unverified row with no provider identity — whatever the
   * caller passed.
   *
   * `passwordHash` is a required parameter rather than an optional one: the two callers make
   * opposite choices and neither should be the default.
   */
  private async insertUser(fields: {
    email: string;
    displayName: string;
    passwordHash: string | null;
  }): Promise<IUser> {
    const user = this.em.create(User, {
      email: fields.email,
      displayName: fields.displayName,
      passwordHash: fields.passwordHash,
    });
    this.em.persist(user);
    await this.em.flush();
    this.logger.info({ userId: user.id }, 'created user');
    await this.eventBus.emit('auth.user.created', { userId: user.id, email: user.email });
    return user;
  }

  /**
   * Apply the claim-or-create half of the matrix, recovering once from a lost insert race.
   *
   * Two registrations for the same brand-new address — a double-submitted form is enough —
   * both read "no such row" and both insert. One loses on `users_email_unique`, and without
   * this the loser is a 500 for what is a perfectly ordinary outcome. The recovery is to
   * re-read: the winner is now visible, it is an unverified row with a `password_hash`,
   * which is the fifth matrix row, so the loser claims it and mails its own link. Both
   * registrants are told the same true thing and one row exists.
   *
   * **`em.clear()`, not a transaction.** B10 names exactly one E01 transaction and it is
   * `findOrCreateFromGithub`'s; there is no multi-statement invariant here that a single
   * flush does not already give, so the only thing the retry has to undo is the losing
   * attempt's unit of work — the entity still queued in it, which a second flush would
   * try to insert again and lose to for ever. Nothing else in the request holds an entity
   * from this `em` at this point.
   *
   * Only `users_email_unique` is retried. `users_github_id_unique` cannot be lost here (no
   * registration writes `github_id`) and every other failure is a defect or an outage that
   * a retry would hide — the second half of edge case 9's rule. One retry only: two
   * consecutive losses are not contention.
   *
   * The hash is computed once, by the caller, and reused. Re-running scrypt for the retry
   * would double the cost of the exact situation the gate is sized to survive.
   */
  private async writeRegistration(
    existing: IUser | null,
    input: RegisterWithPasswordInput,
    passwordHash: string,
  ): Promise<IUser> {
    try {
      return await this.persistRegistration(existing, input, passwordHash);
    } catch (error) {
      if (lostIdentityRace(error) !== 'users_email_unique') {
        throw error;
      }

      this.logger.info(
        { constraint: 'users_email_unique' },
        'lost the registration race, re-reading the winner',
      );
      this.em.clear();
      const winner = await this.em.findOne(User, { email: input.email });
      assertRegistrable(winner);
      return this.persistRegistration(winner, input, passwordHash);
    }
  }

  /** The write itself: claim the unverified row we found, or insert a new one. */
  private async persistRegistration(
    existing: IUser | null,
    input: RegisterWithPasswordInput,
    passwordHash: string,
  ): Promise<IUser> {
    if (existing !== null) {
      // Rows four and five of the matrix. `displayName` is deliberately not overwritten:
      // the address is unproven, so the person supplying this name may not be the person
      // who supplied the last one, and letting an unauthenticated request rewrite a field
      // that is rendered to other users would be a defacement primitive. The hash is
      // overwritten because it grants nothing — see `registerWithPassword`.
      existing.passwordHash = passwordHash;
      await this.em.flush();
      this.logger.info({ userId: existing.id }, 'claimed an unconfirmed account');
      return existing;
    }

    return this.insertUser({
      email: input.email,
      displayName: input.displayName,
      passwordHash,
    });
  }

  /** One attempt at the matching order, inside its own transaction. */
  private attemptGithubSignIn(identity: GithubIdentityInput): Promise<GithubSignInOutcome> {
    return this.em.transactional((tx) => this.resolveGithubIdentity(tx, identity), {
      // A clear fork per attempt. The retry must not inherit the losing attempt's unit of
      // work — the entity it failed to insert is still queued in it, and flushing that
      // again would lose the same race for ever.
      clear: true,
    });
  }

  private async resolveGithubIdentity(
    em: EntityManager,
    identity: GithubIdentityInput,
  ): Promise<GithubSignInOutcome> {
    const announce: GithubSignInOutcome['announce'] = [];

    const linked = await em.findOne(
      User,
      { githubId: identity.githubId },
      { populate: ['mentorProfile'] },
    );
    if (linked !== null) {
      this.refreshGithubProfile(linked, identity);
      this.pushRolesChange(announce, this.reconcileOperatorRole(linked));
      await em.flush();
      return { user: linked, announce };
    }

    const byEmail = await em.findOne(
      User,
      { email: identity.email },
      { populate: ['mentorProfile'] },
    );
    if (byEmail !== null) {
      if (!byEmail.emailVerifiedAt) {
        // Edge case 4. Matching on email alone is an account-takeover vector, so an
        // unverified row is refused outright: nothing is linked and nothing is created.
        //
        // `ConflictError` (409) deliberately. The request is well-formed and the caller
        // *did* authenticate with GitHub, so 400/401 both misdescribe it; it is not a
        // permissions decision, so 403 does not fit either. What blocks the sign-in is the
        // state of an existing resource, and the caller can resolve it themselves — which
        // is exactly 409, and is already the code E01 gives the mirror-image case (edge
        // case 14, registering an email tied to a GitHub account).
        //
        // The message is shown to the user, and disclosing that an account exists for this
        // address costs nothing here: GitHub has just proven the caller owns it.
        throw new ConflictError(
          'An account already exists for this email address but it has not been ' +
            'confirmed yet. Confirm it using the link sent when it was registered, then ' +
            'sign in with GitHub again.',
        );
      }

      byEmail.githubId = identity.githubId;
      this.refreshGithubProfile(byEmail, identity);
      this.pushRolesChange(announce, this.reconcileOperatorRole(byEmail));
      await em.flush();
      this.logger.info(
        { userId: byEmail.id, githubId: identity.githubId },
        'linked a GitHub identity to a verified account',
      );
      return { user: byEmail, announce };
    }

    const created = em.create(User, {
      email: identity.email,
      displayName: identity.displayName,
      // Every new account starts as a mentee (D19). No self-service path grants anything
      // else; `operator` may be added a line below, but only by the allowlist.
      roles: ['mentee'],
      githubId: identity.githubId,
      githubLogin: identity.githubLogin,
      avatarUrl: identity.avatarUrl,
      // GitHub vouched for the address, which is what makes this row linkable later.
      emailVerifiedAt: this.clock.now(),
    });
    em.persist(created);

    // Before the flush, so an allowlisted founder's first sign-in stores the operator cache
    // in the INSERT rather than in a follow-up UPDATE — and, more importantly, so the roles
    // this method returns are the ones the caller must route on. Returning `['mentee']` for
    // a founder would land them on the mentee home on their very first sign-in.
    const rolesChanged = this.reconcileOperatorRole(created);
    await em.flush();

    this.logger.info({ userId: created.id }, 'created user from a GitHub identity');
    announce.push(() =>
      this.eventBus.emit('auth.user.created', {
        userId: created.id,
        email: created.email,
      }),
    );
    this.pushRolesChange(announce, rolesChanged);
    return { user: created, announce };
  }

  private pushRolesChange(
    announce: GithubSignInOutcome['announce'],
    change: PendingRolesChange,
  ): void {
    if (change === null) {
      return;
    }
    announce.push(() => this.eventBus.emit('auth.user.roles_changed', change));
  }

  /**
   * Copy the provider's display-only fields onto an existing row.
   *
   * **`email` is not one of them, and that is load-bearing.** Under the live operator check
   * the row's own address is the authorization key, so a well-meaning
   * `user.email = identity.email` would silently revoke a founder's operator access the
   * moment they changed their GitHub primary address (edge case 26). `users.email` is never
   * updated after creation. `displayName` is left alone too, for a smaller reason: it is
   * the user's own profile field, and E01 has no reason to let a provider overwrite it.
   */
  private refreshGithubProfile(user: IUser, identity: GithubIdentityInput): void {
    user.githubLogin = identity.githubLogin;
    user.avatarUrl = identity.avatarUrl;
  }

  /**
   * Bring the stored `operator` membership back in line with `OPERATOR_EMAILS`, mutating
   * the entity and returning the event that describes the change — or `null` when there was
   * none.
   *
   * Three properties this has to have, all of them from D19:
   *
   * - **Idempotent.** `resolveLiveRoles` returns a canonical array precisely so "did
   *   anything move?" is a cheap comparison; when nothing did, there is no write and no
   *   event, so signing in twice in a row produces one reconciliation at most.
   * - **Only `operator`.** `mentee` and `mentor` are authoritative in the column and are
   *   carried through untouched, so a mentor who is promoted or demoted stays a mentor.
   * - **Never bumps `session_version`.** Reconciliation can happen during a page render,
   *   and a page cannot re-issue a cookie — so a page must not invalidate one. It does not
   *   need to: the stored value carries no authority, `requireSession` derives `operator`
   *   live on every request, and a stale cache is therefore harmless (edge cases 24, 25).
   */
  private reconcileOperatorRole(user: IUser): PendingRolesChange {
    const previousRoles = normalizeRoles(user.roles);
    const roles = resolveLiveRoles(user, this.env.OPERATOR_EMAILS);

    if (roles.length === 0) {
      throw corruptRoleSetError(user.id);
    }
    if (sameMembership(previousRoles, roles)) {
      return null;
    }

    user.roles = roles;
    this.logger.info(
      { userId: user.id, previousRoles, roles },
      'reconciled the stored operator role against OPERATOR_EMAILS',
    );
    return { userId: user.id, roles, previousRoles, reason: 'reconciled' };
  }

  private async changeRoleMembership(
    userId: string,
    role: Role,
    reason: 'granted' | 'revoked',
  ): Promise<SignedInUser> {
    const user = await this.em.findOne(User, { id: userId }, { populate: ['mentorProfile'] });
    if (user === null) {
      throw new NotFoundError('No such user');
    }

    const previousRoles = normalizeRoles(user.roles);
    const held = new Set<Role>(previousRoles);
    if (reason === 'granted') {
      held.add(role);
    } else {
      held.delete(role);
    }
    const roles = normalizeRoles(held);

    if (roles.length === 0) {
      throw new ConflictError(
        `Cannot revoke ${role}: it is the only role this user holds, and an account with ` +
          'no roles cannot sign in. Grant the replacement role first.',
      );
    }

    if (sameMembership(previousRoles, roles)) {
      // Already held, or already absent. A no-op must not bump `session_version` — that
      // would sign the user out of every device to record that nothing happened.
      return { user: toUserDto(user), sessionVersion: user.sessionVersion };
    }

    user.roles = roles;
    // The bump, and the reason this method is on `session_version`'s closed list of
    // triggers: a role change must reach every token the user is holding immediately.
    user.sessionVersion += 1;
    await this.em.flush();

    this.logger.info({ userId, role, reason, roles }, 'changed a user role assignment');
    await this.eventBus.emit('auth.user.roles_changed', {
      userId,
      roles,
      previousRoles,
      reason,
    });

    return { user: toUserDto(user), sessionVersion: user.sessionVersion };
  }
}
