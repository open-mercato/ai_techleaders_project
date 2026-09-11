import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cradle } from '../container/cradle';
import type { ApiRouteContext } from './apiHandler';
import { ConflictError, ForbiddenError, UnauthorizedError } from './errors';
import { z } from 'zod';
import { makeOwnedCollectionRoute, makeOwnedResourceRoute, ownedAction } from './owned-route';

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

describe('makeOwnedResourceRoute', () => {
  it('guards, reads, parses and updates an owner singleton without an owner id', async () => {
    const get = vi.fn(() => ({ name: 'Ada' }));
    const update = vi.fn((_req, _cradle, _params, input: { name: string }) => input);
    const handlers = makeOwnedResourceRoute({
      role: 'mentor',
      get,
      update,
      updateSchema: z.object({ name: z.string().min(1) }),
    });

    const getResponse = await handlers.GET(
      new Request('http://devmentor.test/api/mentors/me'),
      context(),
    );
    expect(await getResponse.json()).toEqual({ ok: true, data: { name: 'Ada' } });

    const putRequest = new Request('http://devmentor.test/api/mentors/me', {
      method: 'PUT',
      headers: { 'x-devmentor-request': '1', 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Grace' }),
    });
    const putResponse = await handlers.PUT(putRequest, context());
    expect(await putResponse.json()).toEqual({ ok: true, data: { name: 'Grace' } });
    expect(update).toHaveBeenCalledWith(putRequest, testState.cradle, undefined, { name: 'Grace' });
    expect(testState.requireRole).toHaveBeenCalledWith(testState.session, 'mentor');
  });

  it('returns standard failures for unsupported and invalid updates', async () => {
    const unsupported = makeOwnedResourceRoute<object, { name: string }>({});
    expect((await unsupported.GET(request(), context())).status).toBe(400);
    expect((await unsupported.PUT(request(), context())).status).toBe(400);

    const noSchema = makeOwnedResourceRoute({ update: () => ({}) });
    expect((await noSchema.PUT(request(), context())).status).toBe(400);

    const invalid = makeOwnedResourceRoute({
      update: () => ({}),
      updateSchema: z.object({ name: z.string() }),
    });
    const response = await invalid.PUT(
      new Request('http://devmentor.test/api/mentors/me', {
        method: 'PUT',
        headers: { 'x-devmentor-request': '1', 'content-type': 'application/json' },
        body: JSON.stringify({ name: 42 }),
      }),
      context(),
    );
    expect(response.status).toBe(422);
  });
});

describe('makeOwnedCollectionRoute', () => {
  it('lists and creates caller-owned resources with route params', async () => {
    const list = vi.fn(() => [{ id: 'one' }]);
    const create = vi.fn((_req, _cradle, _params, input: { value: string }) => ({ id: input.value }));
    const handlers = makeOwnedCollectionRoute({
      role: 'mentor',
      list,
      create,
      createSchema: z.object({ value: z.string() }),
    });
    const params = { parent: 'mine' };
    const getResponse = await handlers.GET(
      new Request('http://devmentor.test/api/resources'),
      context(params),
    );
    expect(await getResponse.json()).toEqual({ ok: true, data: [{ id: 'one' }] });

    const postRequest = new Request('http://devmentor.test/api/resources', {
      method: 'POST',
      headers: { 'x-devmentor-request': '1', 'content-type': 'application/json' },
      body: JSON.stringify({ value: 'two' }),
    });
    const postResponse = await handlers.POST(postRequest, context(params));
    expect(await postResponse.json()).toEqual({ ok: true, data: { id: 'two' } });
    expect(create).toHaveBeenCalledWith(postRequest, testState.cradle, params, { value: 'two' });
  });

  it('returns standard failures for unsupported collection operations', async () => {
    const unsupported = makeOwnedCollectionRoute<object, { value: string }>({});
    expect((await unsupported.GET(request(), context())).status).toBe(400);
    expect((await unsupported.POST(request(), context())).status).toBe(400);
    const noSchema = makeOwnedCollectionRoute({ create: () => ({}) });
    expect((await noSchema.POST(request(), context())).status).toBe(400);
  });

  it('maps invalid JSON and a create conflict through the standard failure envelope', async () => {
    const create = vi.fn(() => {
      throw new ConflictError('That resource already exists.');
    });
    const handlers = makeOwnedCollectionRoute({
      role: 'mentor',
      create,
      createSchema: z.object({ value: z.string() }),
    });
    const malformed = new Request('http://devmentor.test/api/resources', {
      method: 'POST',
      headers: { 'x-devmentor-request': '1', 'content-type': 'application/json' },
      body: '{',
    });

    const invalidResponse = await handlers.POST(malformed, context());
    expect(invalidResponse.status).toBe(400);
    await expect(invalidResponse.json()).resolves.toMatchObject({
      ok: false,
      error: { code: 'bad_request' },
    });
    expect(create).not.toHaveBeenCalled();

    const duplicate = new Request('http://devmentor.test/api/resources', {
      method: 'POST',
      headers: { 'x-devmentor-request': '1', 'content-type': 'application/json' },
      body: JSON.stringify({ value: 'duplicate' }),
    });
    const conflictResponse = await handlers.POST(duplicate, context());
    expect(conflictResponse.status).toBe(409);
    await expect(conflictResponse.json()).resolves.toEqual({
      ok: false,
      error: { code: 'conflict', message: 'That resource already exists.' },
    });
  });
});
