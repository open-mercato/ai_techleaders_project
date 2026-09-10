import {
  asClass,
  asFunction,
  asValue,
  createContainer,
  InjectionMode,
  type AwilixContainer,
} from 'awilix';
import { getOrm } from '@devmentor/db';
import { getEnv, type AppEnv } from '../config/env';
import { createLogger } from '../logger';
import { EventBus } from '../events/event-bus';
import { systemClock } from '../time/clock';
import { EmailVerificationService } from '../services/auth/email-verification.service';
import { PasswordService } from '../services/auth/password.service';
import { SessionService } from '../services/auth/session.service';
import { TokenService } from '../services/auth/token.service';
import { UserService } from '../services/auth/user.service';
import { SlotService } from '../services/availability/slot.service';
import { InvitationService } from '../services/invitations/invitation.service';
import { MentorProfileService } from '../services/mentors/mentor-profile.service';
import { GithubIdentityAdapter } from '../services/auth/adapters/github-identity';
import { MockGithubIdentityAdapter } from '../services/auth/adapters/mock-github-identity';
import type { GithubIdentityPort } from '../services/auth/github-identity.port';
import { LogMailerAdapter } from '../services/notifications/adapters/log-mailer';
import { ResendMailerAdapter } from '../services/notifications/adapters/resend-mailer';
import type { Mailer } from '../services/notifications/mailer.port';
import { resolveSessionFromCookie } from '../http/auth';
import { RateLimiter } from '../http/rate-limit';
import type { Cradle } from './cradle';

/**
 * The root container is cached on `globalThis` so Next.js HMR reuses a single
 * container (and the single ORM/pool it holds) across dev reloads. Registrations are
 * explicit — no `loadModules` globbing — so every binding is greppable.
 */
const globalForContainer = globalThis as unknown as {
  __devmentorContainer?: Promise<AwilixContainer<Cradle>>;
};

/**
 * Refuse to serve a production process that is missing a secret the whole request path
 * depends on. A deployment without `SESSION_SECRET` must not boot green and then 503
 * every sign-in until somebody notices.
 *
 * **This lives in the container and deliberately not in the zod schema.** `npm run
 * build` forces `NODE_ENV=production`, CI's Build job sets no environment at all, and
 * `getEnv()` is reachable at build time (`admin/page.tsx` renders it, and the pino
 * logger reads it), so a schema-level refine on a *missing* secret would fail every CI
 * build. The container is only ever created while serving a request. See B6 in
 * `.ai/specs/2026-09-04-platform-primitives.md` and the 2026-09-08 entry in
 * `.ai/lessons.md`.
 */
function assertProductionSecrets(env: AppEnv): void {
  if (env.NODE_ENV !== 'production') {
    return;
  }

  if (!env.SESSION_SECRET) {
    throw new Error(
      'SESSION_SECRET is required when NODE_ENV=production: it signs every session ' +
        'cookie, so the app cannot authenticate anyone without it. Set it to at least ' +
        '32 characters of random data in the deployment environment.',
    );
  }

  // The second half of the gate, and the reason it is a gate rather than a route-level
  // check: registration fails closed when the verification mail cannot be delivered (edge
  // case 29), so a production deployment with no `MAIL_API_KEY` would boot green, serve
  // every page, and 503 every single sign-up. That is the failure this file exists to
  // prevent. `MAIL_FROM` is not required here — the adapter refuses at the point of use for
  // both (B6) — because B14 names exactly one key as a boot requirement and widening it
  // would refuse a process that a follow-up `MAIL_FROM` deploy would have fixed without a
  // restart of this shape.
  //
  // The exemption needs **both** signals, not just `MAILER_ADAPTER=log`: the harness runs
  // the app with `NODE_ENV=production` and no mail account at all, which is legitimate
  // precisely because `INTEGRATION_TEST_RUN=1` says so. One flag must never be enough — see
  // `selectMailer`, which makes the same selection from the same pair.
  if (!env.MAIL_API_KEY && !(env.MAILER_ADAPTER === 'log' && env.INTEGRATION_TEST_RUN)) {
    throw new Error(
      'MAIL_API_KEY is required when NODE_ENV=production: registration cannot report ' +
        'success without delivering a verification link, so every sign-up would fail with ' +
        '503 without it. Set it to the Resend API key (and MAIL_FROM to the verified ' +
        'sender address) in the deployment environment.',
    );
  }
}

/**
 * Choose the GitHub identity adapter (B14). **The real one unless both signals say
 * otherwise.**
 *
 * The harness builds and runs the app as a child process, so it cannot compose the
 * container in-process and the selection has to cross the boundary as configuration. That
 * makes this the security boundary the port itself is not: the port fixes the *shape* of
 * the seam, the two-signal rule is what makes the *selection* safe.
 *
 * Both flags are re-checked here even though `config/env.ts` already refuses to parse the
 * dangerous half of the combination. That refusal protects a real deployment reading a real
 * environment; this check protects the composition root itself, so that no future caller
 * handing in a hand-built `AppEnv` — a test, a script, a seeder — can select the fake with
 * one flag. Selection is from flags that are *present*, never from credentials that are
 * *absent*: an unconfigured GitHub still gets the real adapter, which fails closed at the
 * route (B6).
 */
function selectGithubIdentity({ env, logger }: Cradle): GithubIdentityPort {
  if (env.AUTH_IDENTITY_ADAPTER === 'mock' && env.INTEGRATION_TEST_RUN) {
    // Loud, once, on first resolution. The combination is legitimate only inside the
    // harness, and an operator who somehow reaches it in a real process must not have to
    // infer it from a sign-in that accepts anybody.
    logger.warn(
      { adapter: 'mock' },
      'the mock GitHub identity adapter is active: sign-in accepts any login without ' +
        'contacting GitHub',
    );
    // No dependencies: the mock redirects the browser to its own origin-relative callback,
    // so unlike the real adapter it needs nothing from `env` — see `authorizeUrl` there.
    return new MockGithubIdentityAdapter();
  }
  return new GithubIdentityAdapter({ env, logger });
}

/**
 * Choose the mailer (B14). **The same two-signal rule as `selectGithubIdentity`, plus one
 * development convenience that cannot apply anywhere else.**
 *
 * Three branches, in priority order:
 *
 * 1. `MAILER_ADAPTER=log` **and** `INTEGRATION_TEST_RUN=1` — the harness. Both flags are
 *    re-checked here even though `config/env.ts` already refuses to parse the dangerous
 *    half, for the reason spelled out on `selectGithubIdentity`: that refusal protects a
 *    real deployment reading a real environment, while this protects the composition root
 *    against a hand-built `AppEnv` from a test, a script or a seeder. One flag is never
 *    enough to select a fake.
 * 2. `development` with `MAILER_ADAPTER` unset — the log mailer, with a boot warning. The
 *    exception is narrow and deliberate: registration fails closed on a delivery failure
 *    (edge case 29), so `npm run dev` with the real adapter and no API key would present a
 *    registration form that always 503s. Note the condition is on `MAILER_ADAPTER` being
 *    **unset**, not on `MAIL_API_KEY` being absent — selection is from flags that are
 *    present, never from credentials that are missing, so a developer who sets
 *    `MAILER_ADAPTER=resend` gets Resend and finds out about a missing key at the route.
 * 3. Anything else — Resend, which fails closed at the point of use if it is unconfigured.
 *    `test` and `production` land here, and production cannot even reach it without a key
 *    (`assertProductionSecrets`).
 */
function selectMailer({ env, logger }: Cradle): Mailer {
  if (env.MAILER_ADAPTER === 'log' && env.INTEGRATION_TEST_RUN) {
    // Loud, once, on first resolution — the same reason the mock identity adapter is loud.
    // An operator who somehow reaches this in a real process must not have to infer it from
    // verification emails that never arrive.
    logger.warn(
      { adapter: 'log' },
      'the log mailer is active: every email is written to this log instead of being ' +
        'delivered, and the log therefore contains live verification links',
    );
    return new LogMailerAdapter({ logger });
  }

  if (env.MAILER_ADAPTER === undefined && env.NODE_ENV === 'development') {
    logger.warn(
      { adapter: 'log' },
      'no MAILER_ADAPTER is set, so emails are written to this log instead of being ' +
        'delivered; set MAILER_ADAPTER=resend with MAIL_API_KEY and MAIL_FROM to send them',
    );
    return new LogMailerAdapter({ logger });
  }

  return new ResendMailerAdapter({ env, logger });
}

async function build(): Promise<AwilixContainer<Cradle>> {
  // Checked before anything is opened, so a misconfigured deployment fails on the
  // configuration rather than on a half-built container.
  const env = getEnv();
  assertProductionSecrets(env);

  // Resolve the ORM once up front so it can be registered as a shared singleton value.
  const orm = await getOrm();

  const container = createContainer<Cradle>({
    injectionMode: InjectionMode.PROXY,
    strict: true,
  });

  container.register({
    env: asValue(env),
    // The arrow is NOT redundant — do not "simplify" it to `asFunction(createLogger)`.
    // This container is `InjectionMode.PROXY`, so awilix invokes every `asFunction`
    // factory with the **cradle proxy as its first argument**. A bare function reference
    // therefore receives the cradle in whatever its first parameter happens to be. That is
    // exactly how a `createLogger(destination?)` overload once passed the cradle to pino as
    // a destination stream, whereupon pino probed `stream.emit`, the proxy tried to resolve
    // a registration named `emit`, and every request that built the container 500'd.
    // `createLogger` is zero-arity now; this pins the call site at zero arguments so that
    // re-adding a parameter to it cannot resurrect the bug here.
    logger: asFunction(() => createLogger()).singleton(),
    orm: asValue(orm),
    eventBus: asClass(EventBus).singleton(),
    clock: asValue(systemClock),
    // SINGLETON, both of them: stateless, and both of their dependencies (`env`,
    // `clock`) are process singletons, so a per-request instance would be a fresh
    // object holding identical references. Nothing request-scoped may ever be added to
    // either — a session service that closed over one request's `em` or session would
    // be a bug that only showed up under concurrency. `SessionService` in particular
    // stays DB-free by design: the `session_version` lookup belongs to `requireSession`,
    // which has a scoped `em`.
    sessionService: asClass(SessionService).singleton(),
    tokenService: asClass(TokenService).singleton(),
    // SINGLETON for a *different* reason, and the lifetime is load-bearing rather than
    // an optimisation: `PasswordService` is the one service here that carries state, a
    // counter of scrypt hashes in flight. That counter has to be process-global to mean
    // anything — a scoped registration would hand every request its own gate starting at
    // zero, so a limit of 2 would admit two 128 MiB hashes *per concurrent request*. The
    // root container itself is cached on `globalThis` (above), which is what makes "one
    // per container" and "one per process" the same thing across Next's several module
    // graphs. Do not make this scoped, and do not construct one anywhere else.
    passwordService: asClass(PasswordService).singleton(),
    // SINGLETON for the same reason: stateless, and its only dependencies are `env` and
    // `logger`. `asFunction` rather than `asClass` because which class this is *is* the
    // decision — see `selectGithubIdentity`.
    githubIdentity: asFunction(selectGithubIdentity).singleton(),
    // SINGLETON for the same reasons again — stateless, `env` and `logger` only — and
    // `asFunction` because which class this is *is* the decision (`selectMailer`). The
    // boot warning riding on that decision is emitted once per process because of this
    // lifetime; a scoped registration would print it on every request.
    mailer: asFunction(selectMailer).singleton(),
    // A forked EntityManager per scope gives each request its own identity map / UoW.
    em: asFunction(({ orm }: Cradle) => orm.em.fork()).scoped(),
    userService: asClass(UserService).scoped(),
    // SCOPED for the same forced reason as `userService`: it writes `email_verified_at`,
    // so it holds `em`, and a singleton would hand every later request the first request's
    // fork. Everything else it needs — `tokenService`, `mailer`, `env`, `clock`, `logger` —
    // is a process singleton reached through this scope, so the per-scope cost is five
    // field assignments. Note in particular that it must resolve `mailer` from the
    // container rather than construct one: which adapter that is, is `selectMailer`'s
    // decision and nothing else's.
    emailVerificationService: asClass(EmailVerificationService).scoped(),
    // SCOPED, and the lifetime is forced rather than chosen: this depends on `em`, which
    // is a per-request fork, so a singleton would capture the *first* request's
    // EntityManager and hand every later request someone else's identity map and unit of
    // work. Unlike `passwordService` there is nothing to lose by that: the limiter is
    // stateless in this process — the counters it reads and writes live in PostgreSQL,
    // which is exactly what makes the limit hold across restarts and across instances —
    // so constructing one per scope costs two field assignments.
    rateLimiter: asClass(RateLimiter).scoped(),
    invitationService: asClass(InvitationService).scoped(),
    mentorProfileService: asClass(MentorProfileService).scoped(),
    slotService: asClass(SlotService).scoped(),
    // The default for a scope nobody opened for a request: no cookie, so no session. Each
    // of `withRequestScope`/`withCookieScope` overrides it on its own scope. Registering it
    // at the root keeps the key resolvable in a `strict` container, which is what lets a
    // service depend on `session` unconditionally instead of guarding for its absence.
    sessionCookie: asValue(null),
    // SCOPED and lazy: awilix caches the promise this factory returns for the lifetime of
    // the scope, so the verification and the single `findOne(User)` behind it happen at
    // most once per request no matter how many guards and services await it. Nothing
    // resolves it unless something asks, so a public route pays nothing.
    // The three dependencies are destructured here rather than inside the resolver so the
    // whole dependency set is resolved synchronously, while awilix is still on the
    // resolution stack, and is visible in the registration itself.
    session: asFunction(({ sessionCookie, sessionService, em, env }: Cradle) =>
      resolveSessionFromCookie(sessionCookie, { sessionService, em, env }),
    ).scoped(),
  });

  // Default in-process subscribers. Concept side effects (send a message, invalidate
  // a cache) register here; for now we just log so the event path is observable.
  container.cradle.eventBus.on('auth.user.created', ({ userId }) => {
    container.cradle.logger.info({ userId }, 'auth.user.created');
  });
  container.cradle.eventBus.on(
    'auth.user.roles_changed',
    ({ userId, roles, previousRoles, reason }) => {
      container.cradle.logger.info(
        { userId, roles, previousRoles, reason },
        'auth.user.roles_changed',
      );
    },
  );
  container.cradle.eventBus.on(
    'invitations.invitation.accepted',
    ({ invitationId, userId, publishDueAt }) => {
      container.cradle.logger.info(
        { invitationId, userId, publishDueAt },
        'invitations.invitation.accepted',
      );
    },
  );
  container.cradle.eventBus.on(
    'mentors.profile.published',
    ({ mentorProfileId, slug }) => {
      container.cradle.logger.info({ mentorProfileId, slug }, 'mentors.profile.published');
    },
  );
  container.cradle.eventBus.on(
    'availability.slot.published',
    ({ mentorProfileId, slotId, startsAt }) => {
      container.cradle.logger.info(
        { mentorProfileId, slotId, startsAt },
        'availability.slot.published',
      );
    },
  );

  return container;
}

export function getContainer(): Promise<AwilixContainer<Cradle>> {
  if (!globalForContainer.__devmentorContainer) {
    globalForContainer.__devmentorContainer = build();
  }
  return globalForContainer.__devmentorContainer;
}

/**
 * Open a scope carrying `sessionCookie`, run `fn` in it, and dispose it afterwards.
 *
 * The one place a scope is created. Registering the cookie on the scope — rather than
 * handing it to each caller — is what makes the lazy `session` key resolvable by anything
 * inside the scope without threading a `Request` through every constructor.
 */
async function runInScope<T>(
  sessionCookie: string | null,
  fn: (cradle: Cradle) => Promise<T> | T,
): Promise<T> {
  const container = await getContainer();
  const scope = container.createScope<Cradle>();
  scope.register({ sessionCookie: asValue(sessionCookie) });
  try {
    return await fn(scope.cradle);
  } finally {
    await scope.dispose();
  }
}

/**
 * Run `fn` inside a fresh awilix scope. The scope owns a forked EntityManager and any
 * other SCOPED services; it is disposed (releasing scoped state) when `fn` settles.
 *
 * No request, therefore no session: `cradle.session` resolves to `null` here. This is the
 * entry point for unauthenticated and system work — a seeder, a background reconciliation,
 * anything with no caller to authorize. Request handlers use `withRequestScope`, and pages
 * use `withCookieScope`, so that resolving the session inside the scope is possible at all.
 */
export function withScope<T>(fn: (cradle: Cradle) => Promise<T> | T): Promise<T> {
  return runInScope(null, fn);
}

/**
 * Run `fn` inside a request scope built from `req`.
 *
 * Additive, and the canonical entry point for any route that may be called by a signed-in
 * user: it reads the (still unverified) session cookie off the request and registers it, so
 * `requireSession` and any service depending on `session` resolve **the same** session,
 * from one database lookup, for the whole request.
 *
 * `core` never imports `next`, so this takes a plain `Request`.
 */
export async function withRequestScope<T>(
  req: Request,
  fn: (cradle: Cradle) => Promise<T> | T,
): Promise<T> {
  const container = await getContainer();
  return runInScope(container.cradle.sessionService.readCookie(req), fn);
}

/**
 * The cookie-value variant of `withRequestScope`, for a caller holding a cookie but no
 * `Request` — which is every App Router page, where the session arrives through
 * `cookies()`. Exported because that page helper lives in `@devmentor/app`; it is a way to
 * *open a scope*, not an authorization API, and the value it takes is unverified until the
 * scope's `session` resolves it.
 */
export function withCookieScope<T>(
  sessionCookie: string | null,
  fn: (cradle: Cradle) => Promise<T> | T,
): Promise<T> {
  return runInScope(sessionCookie, fn);
}
