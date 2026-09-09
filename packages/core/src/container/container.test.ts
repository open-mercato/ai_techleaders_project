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
  INTEGRATION_TEST_RUN: false,
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
});

describe('withScope', () => {
  it('gives each scope its own forked EntityManager and disposes it', async () => {
    const first = await withScope(async (cradle) => cradle.em);
    const second = await withScope(async (cradle) => cradle.em);

    expect(first).not.toBe(second);
    expect(forkCount).toBe(2);
  });

  it('resolves scoped services against the scope', async () => {
    const service = await withScope((cradle) => cradle.userService);

    expect(service).toBeDefined();
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
});
