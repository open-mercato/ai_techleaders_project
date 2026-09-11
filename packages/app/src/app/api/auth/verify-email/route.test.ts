import {
  ServiceUnavailableError,
  VERIFY_EMAIL_PATH,
  type ApiRouteContext,
  type Cradle,
} from '@devmentor/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * `GET /api/auth/verify-email`, invoked directly.
 *
 * The container and `createLogger` are stubbed; `apiHandler`, `safeReturnTo`, `homeFor` and
 * `redirectTo` are real, because the composition is the behaviour: which destination a link
 * lands on, that the session cookie rides on the redirect, and — the property a browser
 * depends on — that **no** outcome answers a JSON envelope. Every assertion checks the status
 * and the `Location`, and the failures additionally check that no body was written.
 */
const container = vi.hoisted(() => ({
  withScope: vi.fn(),
  verify: vi.fn(),
  issue: vi.fn(),
  logError: vi.fn(),
}));

vi.mock('@devmentor/core', async (importOriginal) => {
  const core = await importOriginal<typeof import('@devmentor/core')>();
  return {
    ...core,
    withScope: container.withScope,
    createLogger: () => ({ error: container.logError }),
  };
});

const route = await import('./route');

const context = { params: Promise.resolve({}) } as ApiRouteContext;

const SESSION_COOKIE =
  'devmentor_session=signed.session.jwt; Path=/; Max-Age=86400; HttpOnly; SameSite=Lax';

function open(query: string): Promise<Response> {
  // No CSRF header: a mail client cannot set one, and `apiHandler` exempts `GET`.
  return route.GET(new Request(`http://devmentor.test${VERIFY_EMAIL_PATH}${query}`), context);
}

/** Assert the answer is a bare redirect, and give back where it points. */
async function redirect(response: Response): Promise<string> {
  expect(response.status).toBe(302);
  expect(response.headers.get('content-type')).toBeNull();
  await expect(response.text()).resolves.toBe('');
  return response.headers.get('location') as string;
}

beforeEach(() => {
  vi.clearAllMocks();
  container.verify.mockResolvedValue({
    userId: 'user-1',
    roles: ['mentee'],
    sessionVersion: 0,
  });
  container.issue.mockResolvedValue({ cookie: SESSION_COOKIE });
  container.withScope.mockImplementation((fn: (cradle: Cradle) => unknown) =>
    Promise.resolve().then(() =>
      fn({
        emailVerificationService: { verify: container.verify },
        sessionService: { issue: container.issue },
      } as unknown as Cradle),
    ),
  );
});

describe('/api/auth/verify-email route shape', () => {
  it('exports GET and force-dynamic, and nothing else', () => {
    expect(Object.keys(route).sort()).toEqual(['GET', 'dynamic']);
    expect(route.dynamic).toBe('force-dynamic');
  });
});

describe('a link that verifies', () => {
  it('signs the user in on the redirect itself', async () => {
    const response = await open('?token=good.token');

    expect(container.verify).toHaveBeenCalledExactlyOnceWith('good.token');
    expect(container.issue).toHaveBeenCalledExactlyOnceWith({ id: 'user-1', sessionVersion: 0 });
    // `Response.redirect()` cannot carry `Set-Cookie`; this response was built by hand so it
    // can. Without the cookie the user would land on their home and be bounced to sign-in.
    expect(response.headers.getSetCookie()).toEqual([SESSION_COOKIE]);
    expect(await redirect(response)).toBe('/home');
  });

  it.each([
    [['mentee'], '/home'],
    [['mentor'], '/mentor'],
    [['mentee', 'operator'], '/admin'],
  ])('lands %s on %s when the link carries no destination', async (roles, expected) => {
    container.verify.mockResolvedValue({ userId: 'user-1', roles, sessionVersion: 0 });

    expect(await redirect(await open('?token=good.token'))).toBe(expected);
  });

  it('honours a same-site page path in ?returnTo', async () => {
    const response = await open('?token=good.token&returnTo=%2Fmentors%2Fada%3Fslot%3D9');

    expect(await redirect(response)).toBe('/mentors/ada?slot=9');
  });

  it.each([
    ['//evil.example', 'protocol-relative'],
    ['https://evil.example/x', 'absolute'],
    ['/api/auth/verify-email', 're-entering this route'],
    ['/_next/static/chunk.js', 'a build asset'],
    ['not-a-path', 'no leading slash'],
  ])('falls back to the role home for %s (%s)', async (returnTo) => {
    // Edge case 22. The value was validated when the link was built, but it has been through
    // a mail relay and an inbox since, so it is validated again here.
    const response = await open(`?token=good.token&returnTo=${encodeURIComponent(returnTo)}`);

    expect(await redirect(response)).toBe('/home');
    // Still signed in: a hostile destination is dropped, not treated as a failed link.
    expect(response.headers.getSetCookie()).toEqual([SESSION_COOKIE]);
  });
});

describe('a link that does not verify', () => {
  it('redirects to ?error=verification and sets no cookie', async () => {
    container.verify.mockResolvedValue(null);

    const response = await open('?token=expired.or.forged');

    expect(await redirect(response)).toBe('/sign-in?error=verification');
    expect(response.headers.getSetCookie()).toEqual([]);
    expect(container.issue).not.toHaveBeenCalled();
  });

  it('answers a missing ?token the same way, without a special case', async () => {
    container.verify.mockResolvedValue(null);

    expect(await redirect(await open(''))).toBe('/sign-in?error=verification');
    // The empty string reaches the service, which refuses it like any other bad token —
    // one refusal path rather than two.
    expect(container.verify).toHaveBeenCalledWith('');
  });

  it('redirects rather than rendering an envelope when an expected failure is raised', async () => {
    container.verify.mockRejectedValue(new ServiceUnavailableError('Signed links unavailable'));

    const response = await open('?token=good.token');

    expect(await redirect(response)).toBe('/sign-in?error=verification');
    // An `AppError` was already reported where it was raised, so it is not logged again.
    expect(container.logError).not.toHaveBeenCalled();
  });

  it('logs an unexpected failure and still redirects', async () => {
    const failure = new Error('the database went away');
    container.withScope.mockRejectedValue(failure);

    const response = await open('?token=good.token');

    expect(await redirect(response)).toBe('/sign-in?error=verification');
    // `apiHandler` would have logged this and answered a 500 envelope, which a mail client
    // would render as the page. Logged here, redirected there.
    expect(container.logError).toHaveBeenCalledExactlyOnceWith(
      { err: failure, route: VERIFY_EMAIL_PATH },
      'unhandled failure while confirming an email address',
    );
  });

  it('logs a thrown non-Error too, rather than assuming an Error was thrown', async () => {
    container.withScope.mockRejectedValue('a string');

    expect(await redirect(await open('?token=good.token'))).toBe('/sign-in?error=verification');
    expect(container.logError).toHaveBeenCalledWith(
      { err: 'a string', route: VERIFY_EMAIL_PATH },
      'unhandled failure while confirming an email address',
    );
  });

  it('redirects when the cookie cannot be signed, after the address was confirmed', async () => {
    // The row is verified by now — the service wrote it — so the user's next attempt with the
    // same link is idempotent and succeeds. What must not happen is a JSON 503 on screen.
    container.issue.mockRejectedValue(new ServiceUnavailableError());

    const response = await open('?token=good.token');

    expect(await redirect(response)).toBe('/sign-in?error=verification');
    expect(response.headers.getSetCookie()).toEqual([]);
  });
});
