import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cradle } from '../container/cradle';
import type { ApiRouteContext } from './apiHandler';
import { ForbiddenError, UnauthorizedError } from './errors';
import { ownedAction } from './owned-route';

const testState = vi.hoisted(() => ({
  cradle: {} as unknown,
  session: { userId: 'user-1', roles: ['mentee'] as const },
  withRequestScope: vi.fn(),
  requireSession: vi.fn(),
  requireRole: vi.fn(),
}));

vi.mock('../container/container', () => ({
  withRequestScope: testState.withRequestScope,
}));

vi.mock('./auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./auth')>();
  return {
    ...actual,
    requireSession: testState.requireSession,
    requireRole: testState.requireRole,
  };
});

function request(headers: Record<string, string> = { 'x-devmentor-request': '1' }): Request {
  return new Request('http://devmentor.test/api/invitations/secret/accept', {
    method: 'POST',
    headers,
  });
}

function context(
  params?: Record<string, string | string[]>,
): ApiRouteContext {
  return params === undefined
    ? (undefined as unknown as ApiRouteContext)
    : { params: Promise.resolve(params) };
}

beforeEach(() => {
  vi.clearAllMocks();
  testState.withRequestScope.mockImplementation(
    async (_req: Request, callback: (cradle: Cradle) => Promise<unknown>) =>
      callback(testState.cradle as Cradle),
  );
  testState.requireSession.mockResolvedValue(testState.session);
  testState.requireRole.mockReturnValue(testState.session);
});

describe('ownedAction', () => {
  it('runs a role-less action in the request scope and wraps its data', async () => {
    const run = vi.fn(() => ({ accepted: true }));
    const handler = ownedAction({ run });
    const req = request();
    const params = { token: 'secret' };

    const response = await handler(req, context(params));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: { accepted: true } });
    expect(testState.withRequestScope).toHaveBeenCalledWith(req, expect.any(Function));
    expect(testState.requireSession).toHaveBeenCalledWith(req, testState.cradle);
    expect(testState.requireRole).not.toHaveBeenCalled();
    expect(run).toHaveBeenCalledWith(req, testState.cradle, params);
  });

  it('checks a requested role before running the action', async () => {
    const order: string[] = [];
    testState.requireSession.mockImplementation(async () => {
      order.push('session');
      return testState.session;
    });
    testState.requireRole.mockImplementation(() => {
      order.push('role');
      return testState.session;
    });
    const run = vi.fn(() => {
      order.push('run');
      return 'done';
    });

    const response = await ownedAction({ role: 'mentor', run })(request(), context({}));

    expect(response.status).toBe(200);
    expect(testState.requireRole).toHaveBeenCalledWith(testState.session, 'mentor');
    expect(order).toEqual(['session', 'role', 'run']);
  });

  it('passes through a response so the action can attach a session cookie', async () => {
    const cookieResponse = new Response(JSON.stringify({ ok: true, data: { accepted: true } }), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'set-cookie': 'devmentor_session=fresh; HttpOnly',
      },
    });

    const response = await ownedAction({ run: async () => cookieResponse })(
      request(),
      context({ token: ['secret', 'ignored'] }),
    );

    expect(response).toBe(cookieResponse);
    expect(response.headers.get('set-cookie')).toContain('devmentor_session=fresh');
  });

  it('passes undefined params when Next supplies no route context', async () => {
    const run = vi.fn(() => null);

    const response = await ownedAction({ run })(request(), context());

    expect(response.status).toBe(200);
    expect(run).toHaveBeenCalledWith(expect.any(Request), testState.cradle, undefined);
  });

  it('denies an unauthenticated caller before checking a role or running', async () => {
    testState.requireSession.mockRejectedValue(new UnauthorizedError());
    const run = vi.fn();

    const response = await ownedAction({ role: 'mentor', run })(request(), context({}));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      ok: false,
      error: { code: 'unauthorized', message: 'Authentication required' },
    });
    expect(testState.requireRole).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it('denies a caller without the requested role before running', async () => {
    testState.requireRole.mockImplementation(() => {
      throw new ForbiddenError();
    });
    const run = vi.fn();

    const response = await ownedAction({ role: 'mentor', run })(request(), context({}));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: 'forbidden' },
    });
    expect(run).not.toHaveBeenCalled();
  });

  it('leaves CSRF enforcement to apiHandler and never opens a scope for a bare POST', async () => {
    const run = vi.fn();

    const response = await ownedAction({ run })(request({}), context({}));

    expect(response.status).toBe(403);
    expect(testState.withRequestScope).not.toHaveBeenCalled();
    expect(testState.requireSession).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });
});
