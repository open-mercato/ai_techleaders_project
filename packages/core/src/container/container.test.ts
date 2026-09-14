import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppEnv } from '../config/env';

/**
 * Test seam for the composition root.
 *
 * `container.ts` sits on top of the whole app: it pulls in `@devmentor/db` (and through
 * it the entire MikroORM graph), the pino logger, and every domain service. Rather than
 * reset the module registry per case — the timeout trap recorded in the 2026-09-03
 * lesson — the three edges are stubbed once, here, and `./container` is imported a
 * single time at module scope. Everything a case wants to vary is a mutable module
 * variable the stubs read on each call.
 */

/** The row the scoped session's single `findOne` answers with. */
let storedUser: {
  id: string;
  email: string;
  roles: string[];
  emailVerifiedAt: Date | null;
  sessionVersion: number;
} | null;

/** Counts every user lookup, which is how "one lookup per scope" is proven rather than assumed. */
const findOne = vi.fn(async () => storedUser);

/** A forked EntityManager stand-in; a fresh object per fork proves the SCOPED lifetime. */
let forkCount = 0;
const fakeOrm = {
  em: {
    fork: () => {
      forkCount += 1;
      return { forkId: forkCount, findOne };
    },
  },
};

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

/** The environment the container under test sees. Overwritten per case by `useEnv`. */
let currentEnv: AppEnv;

vi.mock('@devmentor/db', () => ({
  getOrm: async () => fakeOrm,
  // `user.service.ts` imports `User` as a value; it is only touched inside methods the
  // container tests never call, so an inert placeholder is enough. `ROLES` is real,
  // because the scoped session's live operator derivation orders its output by it.
  User: {},
  ROLES: ['mentee', 'mentor', 'operator'],
}));
vi.mock('../config/env', () => ({ getEnv: () => currentEnv }));
vi.mock('../logger', () => ({ createLogger: () => logger }));

const { getContainer, withScope, withRequestScope, withCookieScope } = await import(
  './container'
);
const { requireSession } = await import('../http/auth');
const { GithubIdentityAdapter } = await import('../services/auth/adapters/github-identity');
const { MockGithubIdentityAdapter } = await import(
  '../services/auth/adapters/mock-github-identity'
);
const { LogMailerAdapter } = await import('../services/notifications/adapters/log-mailer');
const { ResendMailerAdapter } = await import(
  '../services/notifications/adapters/resend-mailer'
);
const { MockPaymentGateway } = await import(
  '../services/payments/adapters/mock-payment-gateway'
);
const { StripePaymentGateway } = await import(
  '../services/payments/adapters/stripe-payment-gateway'
);

/** The container is cached on `globalThis` to survive HMR; tests must clear that cache. */
const globalForContainer = globalThis as unknown as { __devmentorContainer?: unknown };

const BASE_ENV = {
  NODE_ENV: 'development',
  APP_NAME: 'DevMentor',
  LOG_LEVEL: 'silent',
  DB_HOST: '127.0.0.1',
  DB_PORT: 5432,
  DB_NAME: 'devmentor',
  DB_USER: 'devmentor',
  DB_PASSWORD: 'devmentor',
  OPERATOR_EMAILS: [],
  APP_URL: 'http://localhost:3000',
  TRUSTED_PROXY_HOPS: 0,
  PASSWORD_HASH_CONCURRENCY: 2,
  PASSWORD_HASH_WAIT_MS: 1000,
  PLATFORM_CURRENCY: 'PLN',
  PLATFORM_PRICE_BOUNDS: {
    p25: { minCents: 9_000, maxCents: 60_000 },
    p50: { minCents: 18_000, maxCents: 120_000 },
  },
  PLATFORM_FEE_PERCENT: 20,
  INTEGRATION_TEST_RUN: false,
  // Present in the baseline so the *production* cases below are about the secret each of
  // them names. `assertProductionSecrets` requires this one too, and a baseline without it
  // would make every production case fail for the wrong reason; the case that asserts the
  // requirement unsets it explicitly.
  MAIL_API_KEY: 'resend-api-key-value',
} as unknown as AppEnv;

function useEnv(overrides: Partial<AppEnv> = {}): void {
  currentEnv = { ...BASE_ENV, ...overrides };
}

const SECRET = 'a'.repeat(32);

beforeEach(() => {
  delete globalForContainer.__devmentorContainer;
  forkCount = 0;
  vi.clearAllMocks();
  useEnv();
  storedUser = {
    id: 'user-1',
    email: 'ada@devmentor.dev',
    roles: ['mentee'],
    emailVerifiedAt: new Date('2026-09-01T00:00:00.000Z'),
    sessionVersion: 0,
  };
});

/** A request carrying a real, freshly signed session cookie for `storedUser`. */
async function signedInRequest(): Promise<Request> {
  const container = await getContainer();
  const { cookie } = await container.cradle.sessionService.issue({
    id: 'user-1',
    sessionVersion: 0,
  });
  return new Request('http://devmentor.test/api/users', {
    headers: { cookie: `theme=dark; ${cookie.slice(0, cookie.indexOf(';'))}` },
  });
}

describe('getContainer', () => {
  it('registers the shared singletons', async () => {
    const container = await getContainer();

    expect(container.cradle.env).toBe(currentEnv);
    expect(container.cradle.logger).toBe(logger);
    expect(container.cradle.orm).toBe(fakeOrm);
    expect(container.cradle.clock.now()).toBeInstanceOf(Date);
    expect(container.cradle.eventBus).toBe(container.cradle.eventBus);
    // `tokenService` and `sessionService` are SINGLETONs: stateless, and both of their
    // dependencies are process singletons. Resolving one twice must give one object.
    expect(container.cradle.tokenService).toBe(container.cradle.tokenService);
    expect(container.cradle.sessionService).toBe(container.cradle.sessionService);
  });

  it('shares one tokenService across request scopes', async () => {
    const first = await withScope((cradle) => cradle.tokenService);
    const second = await withScope((cradle) => cradle.tokenService);

    expect(first).toBe(second);
  });

  it('shares one sessionService across request scopes', async () => {
    const first = await withScope((cradle) => cradle.sessionService);
    const second = await withScope((cradle) => cradle.sessionService);

    expect(first).toBe(second);
  });

  it('shares one configuration-backed platformSettingsService across scopes', async () => {
    const first = await withScope((cradle) => cradle.platformSettingsService);
    const second = await withScope((cradle) => cradle.platformSettingsService);

    expect(first).toBe(second);
    expect(first.get()).toEqual({
      currency: 'PLN',
      priceBounds: {
        p25: { minCents: 9_000, maxCents: 60_000 },
        p50: { minCents: 18_000, maxCents: 120_000 },
      },
      feePercent: 20,
    });
  });

  it('shares one passwordService across request scopes, because its gate counts hashes', async () => {
    // Not an optimisation: `PasswordService` holds the count of scrypt hashes in flight,
    // and that count has to be process-wide. A scoped registration would give every
    // request a private gate starting at zero, so a limit of 2 would admit two 128 MiB
    // hashes *per concurrent request* — which is no limit at all. If this ever fails,
    // the lifetime was changed and the memory bound went with it.
    const first = await withScope((cradle) => cradle.passwordService);
    const second = await withScope((cradle) => cradle.passwordService);
    const root = (await getContainer()).cradle.passwordService;

    expect(first).toBe(second);
    expect(first).toBe(root);
  });

  it('builds the passwordService gate from the configured limits', async () => {
    // Proves the env actually reaches the constructor rather than a default being used:
    // one slot, no wait, so a second caller is refused while the first holds the gate.
    useEnv({ PASSWORD_HASH_CONCURRENCY: 1, PASSWORD_HASH_WAIT_MS: 0 } as Partial<AppEnv>);
    const service = (await getContainer()).cradle.passwordService;

    const held = service.withSlot(
      () => new Promise<void>((resolve) => setTimeout(resolve, 5)),
    );
    await expect(service.withSlot(async () => 'second')).rejects.toMatchObject({
      status: 503,
    });
    await held;
  });

  it('injects the env and clock into sessionService, not a fresh copy of either', async () => {
    // The lifetime is only safe because the service holds process-wide references. If a
    // scope ever handed it something request-scoped, this cookie would still be issued
    // from the singleton's captured `env`, so assert the wiring rather than assume it.
    useEnv({ NODE_ENV: 'production', SESSION_SECRET: 'a'.repeat(32) });
    const container = await getContainer();

    const { cookie } = await container.cradle.sessionService.issue({
      id: 'user-1',
      sessionVersion: 0,
    });

    expect(cookie).toContain('Secure');
  });

  it('builds once and reuses the cached container', async () => {
    const first = await getContainer();
    const second = await getContainer();

    expect(second).toBe(first);
    // A second build would have forked nothing yet, but it would have re-registered —
    // identity is the assertion that matters, so also check the cache is what answered.
    expect(globalForContainer.__devmentorContainer).toBeDefined();
  });

  it('logs the default auth.user.created subscriber', async () => {
    const container = await getContainer();

    await container.cradle.eventBus.emit('auth.user.created', {
      userId: 'user-1',
      email: 'ada@devmentor.test',
    });

    expect(logger.info).toHaveBeenCalledWith({ userId: 'user-1' }, 'auth.user.created');
  });

  it('logs the default auth.user.roles_changed subscriber', async () => {
    // The event exists to make the operator cache update observable. It is deliberately
    // *not* the R18 audit record — that is the `OPERATOR_EMAILS` commit — so a pino line
    // is the whole of the default subscriber.
    const container = await getContainer();

    await container.cradle.eventBus.emit('auth.user.roles_changed', {
      userId: 'user-1',
      roles: ['mentee', 'operator'],
      previousRoles: ['mentee'],
      reason: 'reconciled',
    });

    expect(logger.info).toHaveBeenCalledWith(
      {
        userId: 'user-1',
        roles: ['mentee', 'operator'],
        previousRoles: ['mentee'],
        reason: 'reconciled',
      },
      'auth.user.roles_changed',
    );
  });

  it('logs the default invitations.invitation.accepted subscriber without a token', async () => {
    const container = await getContainer();

    await container.cradle.eventBus.emit('invitations.invitation.accepted', {
      invitationId: 'inv-1',
      userId: 'user-1',
      publishDueAt: '2026-09-24T12:00:00.000Z',
    });

    expect(logger.info).toHaveBeenCalledWith(
      {
        invitationId: 'inv-1',
        userId: 'user-1',
        publishDueAt: '2026-09-24T12:00:00.000Z',
      },
      'invitations.invitation.accepted',
    );
  });

  it('logs the default mentors.profile.published subscriber', async () => {
    const container = await getContainer();
    await container.cradle.eventBus.emit('mentors.profile.published', {
      mentorProfileId: 'profile-1',
      slug: 'ada-lovelace',
    });
    expect(logger.info).toHaveBeenCalledWith(
      { mentorProfileId: 'profile-1', slug: 'ada-lovelace' },
      'mentors.profile.published',
    );
  });

  it('logs the default availability.slot.published subscriber', async () => {
    const container = await getContainer();
    await container.cradle.eventBus.emit('availability.slot.published', {
      mentorProfileId: 'profile-1',
      slotId: 'slot-1',
      startsAt: '2026-09-10T14:00:00.000Z',
    });
    expect(logger.info).toHaveBeenCalledWith(
      {
        mentorProfileId: 'profile-1',
        slotId: 'slot-1',
        startsAt: '2026-09-10T14:00:00.000Z',
      },
      'availability.slot.published',
    );
  });

  it('logs the default bookings.booking.cancelled subscriber', async () => {
    const container = await getContainer();
    const payload = {
      bookingId: 'booking-1',
      menteeId: 'user-1',
      mentorProfileId: 'profile-1',
      startsAt: '2026-09-14T15:00:00.000Z',
      refunded: true,
    };

    await container.cradle.eventBus.emit('bookings.booking.cancelled', payload);

    expect(logger.info).toHaveBeenCalledWith(payload, 'bookings.booking.cancelled');
  });

  it('logs the default bookings.booking.confirmed subscriber', async () => {
    const container = await getContainer();
    const payload = {
      bookingId: 'booking-1',
      menteeId: 'user-1',
      mentorProfileId: 'profile-1',
      startsAt: '2026-09-14T15:00:00.000Z',
      lengthMinutes: 25,
    };

    await container.cradle.eventBus.emit('bookings.booking.confirmed', payload);

    expect(logger.info).toHaveBeenCalledWith(payload, 'bookings.booking.confirmed');
  });
});

describe('withScope', () => {
  it('gives each scope its own forked EntityManager and disposes it', async () => {
    const first = await withScope(async (cradle) => cradle.em);
    const second = await withScope(async (cradle) => cradle.em);

    expect(first).not.toBe(second);
    expect(forkCount).toBe(2);
  });

  it('resolves scoped services against the scope', async () => {
    const services = await withScope((cradle) => [
      cradle.userService,
      cradle.invitationService,
      cradle.mentorProfileService,
      cradle.slotService,
      cradle.platformSettingsService,
    ]);

    expect(services).toHaveLength(5);
    expect(services.every(Boolean)).toBe(true);
  });

  it('gives the rate limiter its own scope’s EntityManager, never a shared one', async () => {
    // The lifetime is forced by the dependency: `RateLimiter` holds `em`, and `em` is a
    // per-request fork. A singleton registration would capture the first request's
    // EntityManager and hand it to everyone afterwards. Contrast `passwordService`, which
    // is a singleton *because* its state must be process-global.
    const [first, second] = await Promise.all([
      withScope((cradle) => ({ limiter: cradle.rateLimiter, em: cradle.em })),
      withScope((cradle) => ({ limiter: cradle.rateLimiter, em: cradle.em })),
    ]);
    const sameScope = await withScope((cradle) => [cradle.rateLimiter, cradle.rateLimiter]);

    expect(first.limiter).not.toBe(second.limiter);
    // The instance a scope resolves twice is cached, so a route and a service in one
    // request share one limiter over one EntityManager.
    expect(sameScope[0]).toBe(sameScope[1]);
    // `em` is private on the limiter, so the proof it took *this* scope's fork is that a
    // statement issued through it lands on that scope's EntityManager.
    const execute = vi.fn(async () => [{ count: 1, retry_after_seconds: 1 }]);
    (first.em as unknown as { execute: unknown }).execute = execute;
    await first.limiter.consume('sign-in:ip:probe', { limit: 5, windowMs: 1000 });
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('gives the email verification service its own scope, the container’s mailer and the container’s env', async () => {
    // SCOPED for the same forced reason as `userService` — it writes `email_verified_at`,
    // so it holds `em`. The mailer half is the part worth pinning: which adapter answers is
    // `selectMailer`'s decision, so the service must *resolve* it rather than construct
    // one, or an integration run would deliver real mail.
    useEnv({ SESSION_SECRET: SECRET });
    const container = await getContainer();
    const send = vi.spyOn(container.cradle.mailer, 'send').mockResolvedValue(undefined);

    const [first, second] = await Promise.all([
      withScope((cradle) => cradle.emailVerificationService),
      withScope((cradle) => cradle.emailVerificationService),
    ]);
    const sameScope = await withScope((cradle) => [
      cradle.emailVerificationService,
      cradle.emailVerificationService,
    ]);

    expect(first).not.toBe(second);
    expect(sameScope[0]).toBe(sameScope[1]);

    await withScope((cradle) =>
      cradle.emailVerificationService.sendVerificationLink({
        user: { id: 'user-1', email: 'ada@devmentor.dev' },
      }),
    );

    expect(send).toHaveBeenCalledTimes(1);
    // The link is built from the container's `env`, and the token is signed with the
    // container's `SESSION_SECRET` — both reached through the singleton `tokenService`.
    expect(send.mock.calls[0]?.[0].text).toContain(
      'http://localhost:3000/api/auth/verify-email?token=',
    );
  });

  it('disposes the scope even when the callback throws', async () => {
    const container = await getContainer();
    const createScope = container.createScope.bind(container);
    const disposals: string[] = [];
    vi.spyOn(container, 'createScope').mockImplementation(() => {
      const scope = createScope();
      const dispose = scope.dispose.bind(scope);
      scope.dispose = async () => {
        disposals.push('disposed');
        await dispose();
      };
      return scope;
    });

    await expect(
      withScope(() => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(disposals).toEqual(['disposed']);
  });
});

describe('the scoped session', () => {
  beforeEach(() => {
    useEnv({ SESSION_SECRET: SECRET });
  });

  it('resolves once per scope, however many callers ask for it', async () => {
    // This is B2's "one indexed primary-key lookup" cost claim, made true by awilix's
    // scoped caching: the route guard and a service both needing the session must not each
    // reload the user.
    const req = await signedInRequest();

    const [fromGuard, fromService] = await withRequestScope(req, async (cradle) => [
      await requireSession(req, cradle),
      await cradle.session,
    ]);

    expect(fromGuard).toEqual({ userId: 'user-1', roles: ['mentee'] });
    expect(fromService).toBe(fromGuard);
    expect(findOne).toHaveBeenCalledOnce();
  });

  it('resolves separately in a second scope, so a role change is never cached across requests', async () => {
    const req = await signedInRequest();

    await withRequestScope(req, (cradle) => cradle.session);
    await withRequestScope(req, (cradle) => cradle.session);

    expect(findOne).toHaveBeenCalledTimes(2);
  });

  it('costs nothing until something asks for it', async () => {
    const req = await signedInRequest();

    await withRequestScope(req, (cradle) => cradle.em);

    expect(findOne).not.toHaveBeenCalled();
  });

  it('answers null for a request with no cookie, rather than throwing', async () => {
    // A public route may resolve the session freely; failing closed stays the caller's
    // explicit decision.
    const anonymous = new Request('http://devmentor.test/');

    await expect(
      withRequestScope(anonymous, (cradle) => cradle.session),
    ).resolves.toBeNull();
    expect(findOne).not.toHaveBeenCalled();
  });

  it('derives operator authority live from the allowlist', async () => {
    useEnv({ SESSION_SECRET: SECRET, OPERATOR_EMAILS: ['ada@devmentor.dev'] });
    const req = await signedInRequest();

    await expect(withRequestScope(req, (cradle) => cradle.session)).resolves.toEqual({
      userId: 'user-1',
      roles: ['mentee', 'operator'],
    });
  });

  it('resolves the same session from a bare cookie value, for a page with no Request', async () => {
    const container = await getContainer();
    const { cookie } = await container.cradle.sessionService.issue({
      id: 'user-1',
      sessionVersion: 0,
    });
    const token = cookie.slice(cookie.indexOf('=') + 1, cookie.indexOf(';'));

    await expect(withCookieScope(token, (cradle) => cradle.session)).resolves.toEqual({
      userId: 'user-1',
      roles: ['mentee'],
    });
  });

  it('answers null in a scope opened for system work', async () => {
    // `withScope` carries no request, so there is no caller to authorize and no lookup to
    // make. Unauthenticated and background work keeps working unchanged.
    await expect(withScope((cradle) => cradle.session)).resolves.toBeNull();
    expect(findOne).not.toHaveBeenCalled();
  });
});

describe('selecting the GitHub identity adapter', () => {
  it('registers the real adapter when nothing asks for anything else', async () => {
    const container = await getContainer();

    expect(container.cradle.githubIdentity).toBeInstanceOf(GithubIdentityAdapter);
  });

  it('registers the mock only when both signals are set', async () => {
    useEnv({ AUTH_IDENTITY_ADAPTER: 'mock', INTEGRATION_TEST_RUN: true });
    const container = await getContainer();

    expect(container.cradle.githubIdentity).toBeInstanceOf(MockGithubIdentityAdapter);
    // Loud on the way in. The combination is legitimate only inside the harness, and an
    // operator who reaches it in a real process must not have to infer it from a sign-in
    // that accepts anybody.
    expect(logger.warn).toHaveBeenCalledWith(
      { adapter: 'mock' },
      expect.stringContaining('mock GitHub identity adapter is active'),
    );
  });

  it('keeps the real adapter when the switch is set without the integration-run signal', async () => {
    // The other direction, and the security-relevant one. `config/env.ts` refuses to parse
    // this combination at all, so a real deployment never reaches here — but the container
    // is also composable from a hand-built `AppEnv` (a script, a seeder, a test), and one
    // flag must never be enough to select the fake.
    useEnv({ AUTH_IDENTITY_ADAPTER: 'mock', INTEGRATION_TEST_RUN: false });
    const container = await getContainer();

    expect(container.cradle.githubIdentity).toBeInstanceOf(GithubIdentityAdapter);
    expect(container.cradle.githubIdentity).not.toBeInstanceOf(MockGithubIdentityAdapter);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('keeps the real adapter in an integration run that did not ask for the mock', async () => {
    // Selection is from flags that are *present*. An integration run exercising the real
    // adapter against a stub upstream is a legitimate thing to want.
    useEnv({ AUTH_IDENTITY_ADAPTER: 'github', INTEGRATION_TEST_RUN: true });
    const container = await getContainer();

    expect(container.cradle.githubIdentity).toBeInstanceOf(GithubIdentityAdapter);
  });

  it('never selects the mock from absent credentials', async () => {
    // The rule that would have been easy and wrong: "no GITHUB_CLIENT_ID, so use the
    // fake". An unconfigured deployment gets the real adapter and fails closed at the
    // route (B6, edge case 1).
    useEnv({ GITHUB_CLIENT_ID: undefined, GITHUB_CLIENT_SECRET: undefined });
    const container = await getContainer();

    expect(container.cradle.githubIdentity).toBeInstanceOf(GithubIdentityAdapter);
  });

  it('shares one adapter for the process', async () => {
    const container = await getContainer();

    expect(container.cradle.githubIdentity).toBe(container.cradle.githubIdentity);
    expect(await withScope((cradle) => cradle.githubIdentity)).toBe(
      container.cradle.githubIdentity,
    );
  });
});

describe('selecting the mailer', () => {
  it('registers Resend when nothing asks for anything else', async () => {
    useEnv({ NODE_ENV: 'test' } as Partial<AppEnv>);
    const container = await getContainer();

    expect(container.cradle.mailer).toBeInstanceOf(ResendMailerAdapter);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('registers the log mailer only when both signals are set', async () => {
    useEnv({ MAILER_ADAPTER: 'log', INTEGRATION_TEST_RUN: true });
    const container = await getContainer();

    expect(container.cradle.mailer).toBeInstanceOf(LogMailerAdapter);
    // Loud on the way in: this adapter writes live verification links into the log, so a
    // process that somehow reaches it in a real deployment must say so rather than leave an
    // operator to discover it from mail that never arrives.
    expect(logger.warn).toHaveBeenCalledWith(
      { adapter: 'log' },
      expect.stringContaining('log mailer is active'),
    );
  });

  it('keeps the real mailer when the switch is set without the integration-run signal', async () => {
    // The security-relevant direction. `config/env.ts` refuses to parse this combination at
    // all, so a real deployment never reaches here — but the container is also composable
    // from a hand-built `AppEnv` (a script, a seeder, a test), and one flag must never be
    // enough to select a fake that writes credentials to a log.
    useEnv({ MAILER_ADAPTER: 'log', INTEGRATION_TEST_RUN: false });
    const container = await getContainer();

    expect(container.cradle.mailer).toBeInstanceOf(ResendMailerAdapter);
    expect(container.cradle.mailer).not.toBeInstanceOf(LogMailerAdapter);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('keeps the real mailer in an integration run that did not ask for the log adapter', async () => {
    useEnv({ MAILER_ADAPTER: 'resend', INTEGRATION_TEST_RUN: true });
    const container = await getContainer();

    expect(container.cradle.mailer).toBeInstanceOf(ResendMailerAdapter);
  });

  it('registers Stripe as soon as a secret key is configured, in any environment', async () => {
    useEnv({ NODE_ENV: 'development', STRIPE_SECRET_KEY: 'sk_test_x' });
    const container = await getContainer();

    expect(container.cradle.paymentGateway).toBeInstanceOf(StripePaymentGateway);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('falls back to the mock gateway without a key, loudly', async () => {
    // Unlike the identity and mail seams this needs no second signal: a mock gateway takes
    // no money and confirms nothing without a signed webhook, so the failure mode is a
    // product that visibly cannot be paid rather than one that is quietly unsafe. It is
    // still loud, because "payments appear to work and charge nobody" must not have to be
    // inferred from a bank statement.
    useEnv({ STRIPE_SECRET_KEY: undefined });
    const container = await getContainer();

    expect(container.cradle.paymentGateway).toBeInstanceOf(MockPaymentGateway);
    expect(logger.warn).toHaveBeenCalledWith(
      { adapter: 'mock' },
      expect.stringContaining('no STRIPE_SECRET_KEY is set'),
    );
  });

  it('shares one payment gateway across scopes, so a session outlives its request', async () => {
    useEnv({ STRIPE_SECRET_KEY: undefined });
    const container = await getContainer();

    const [first, second] = await Promise.all([
      withScope((cradle) => cradle.paymentGateway),
      withScope((cradle) => cradle.paymentGateway),
    ]);
    expect(first).toBe(second);
    expect(first).toBe(container.cradle.paymentGateway);
  });

  it('picks the log mailer in development when MAILER_ADAPTER is unset, and warns', async () => {
    // Edge case 29: registration fails closed on a delivery failure, so `npm run dev` with
    // the real adapter and no API key would present a form that always 503s. The link ends
    // up in the terminal the dev server is already printing to.
    useEnv({ NODE_ENV: 'development', MAILER_ADAPTER: undefined, MAIL_API_KEY: undefined });
    const container = await getContainer();

    expect(container.cradle.mailer).toBeInstanceOf(LogMailerAdapter);
    expect(logger.warn).toHaveBeenCalledWith(
      { adapter: 'log' },
      expect.stringContaining('no MAILER_ADAPTER is set'),
    );
  });

  it('respects an explicit resend choice in development, key or no key', async () => {
    // Selection is from flags that are *present*, never from credentials that are absent.
    // A developer who names the real adapter gets it, and finds out about the missing key
    // at the route rather than by wondering why no mail arrived.
    useEnv({
      NODE_ENV: 'development',
      MAILER_ADAPTER: 'resend',
      MAIL_API_KEY: undefined,
    });
    const container = await getContainer();

    expect(container.cradle.mailer).toBeInstanceOf(ResendMailerAdapter);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it('does not extend the development default to test or production', async () => {
    // `test` has no `MAILER_ADAPTER` either, and must still get the real adapter: the
    // convenience is about a human running `npm run dev`, not about any non-production
    // environment.
    useEnv({ NODE_ENV: 'test', MAILER_ADAPTER: undefined });

    expect((await getContainer()).cradle.mailer).toBeInstanceOf(ResendMailerAdapter);
  });

  it('shares one mailer for the process, so the boot warning is printed once', async () => {
    useEnv({ MAILER_ADAPTER: 'log', INTEGRATION_TEST_RUN: true });
    const container = await getContainer();

    expect(container.cradle.mailer).toBe(container.cradle.mailer);
    expect(await withScope((cradle) => cradle.mailer)).toBe(container.cradle.mailer);
    expect(logger.warn).toHaveBeenCalledOnce();
  });
});

describe('the production secret gate', () => {
  it('refuses to build a production container without SESSION_SECRET', async () => {
    useEnv({ NODE_ENV: 'production', SESSION_SECRET: undefined });

    await expect(getContainer()).rejects.toThrow(/SESSION_SECRET is required/);
  });

  it('builds in production once SESSION_SECRET is set', async () => {
    useEnv({ NODE_ENV: 'production', SESSION_SECRET: 'a'.repeat(32) });

    await expect(getContainer()).resolves.toBeDefined();
  });

  it('does not require the secret outside production', async () => {
    // `npm run dev` must start without anyone inventing a secret first; sign-in fails
    // closed at the route instead (edge case 1). The mirror image of this — that
    // `next build`, which runs as production with no environment in CI, is unaffected —
    // holds because the build never creates a container; only `getEnv()` runs, and the
    // schema has no such requirement (see `env.test.ts`).
    useEnv({ NODE_ENV: 'development', SESSION_SECRET: undefined });

    await expect(getContainer()).resolves.toBeDefined();
  });

  it('refuses to build a production container without MAIL_API_KEY', async () => {
    // Edge case 1b, second half. Without it the deployment boots green, serves every page,
    // and 503s every single sign-up — because registration must not report success for a
    // verification link it could not deliver (edge case 29).
    useEnv({ NODE_ENV: 'production', SESSION_SECRET: SECRET, MAIL_API_KEY: undefined });

    await expect(getContainer()).rejects.toThrow(/MAIL_API_KEY is required/);
  });

  it('exempts a production process that legitimately selected the log mailer', async () => {
    // The harness runs the app as `NODE_ENV=production` with no mail account at all. That
    // is legitimate *because* `INTEGRATION_TEST_RUN=1` says so — see `environment.ts`.
    useEnv({
      NODE_ENV: 'production',
      SESSION_SECRET: SECRET,
      MAIL_API_KEY: undefined,
      MAILER_ADAPTER: 'log',
      INTEGRATION_TEST_RUN: true,
    });

    const container = await getContainer();

    expect(container.cradle.mailer).toBeInstanceOf(LogMailerAdapter);
  });

  it('does not accept MAILER_ADAPTER=log alone as the exemption', async () => {
    // One flag is never enough. The env schema refuses this pair outright, and the gate
    // refuses it again for a hand-built `AppEnv` that never went through the schema.
    useEnv({
      NODE_ENV: 'production',
      SESSION_SECRET: SECRET,
      MAIL_API_KEY: undefined,
      MAILER_ADAPTER: 'log',
      INTEGRATION_TEST_RUN: false,
    });

    await expect(getContainer()).rejects.toThrow(/MAIL_API_KEY is required/);
  });

  it('does not require a mail key outside production', async () => {
    // Same reasoning as the session secret: `npm run dev` must start without a mail account,
    // and `next build` — production, no environment, in CI — never creates a container.
    useEnv({ NODE_ENV: 'development', MAIL_API_KEY: undefined });

    await expect(getContainer()).resolves.toBeDefined();
  });
});
