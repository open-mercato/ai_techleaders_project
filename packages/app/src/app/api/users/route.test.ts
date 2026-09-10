import {
  ForbiddenError,
  UnauthorizedError,
  type Cradle,
  type MakeCrudRouteOptions,
  type Session,
  type UserDto,
} from '@devmentor/core';
import { describe, expect, it, vi } from 'vitest';

/**
 * The route is configuration, and what is worth asserting about it is the configuration:
 * which verbs it exports, and what its `authorize` hook decides. Everything downstream —
 * that `makeCrudRoute` runs `authorize` before it resolves the service, that a thrown
 * `AppError` becomes the right status — belongs to `makeCrudRoute.test.ts` and
 * `apiHandler.test.ts` and is not restated here.
 *
 * Only `makeCrudRoute` is stubbed, so the guard under test is the **real**
 * `requireSession` + `requireRole` pair. Stubbing those instead would assert that the
 * route calls two functions, which is not the same claim as "an anonymous caller is
 * refused". The stub is what removes the container, and with it the database, from a test
 * about authorization.
 */
const captured = vi.hoisted(() => ({
  options: undefined as MakeCrudRouteOptions<UserDto, never, never> | undefined,
}));

vi.mock('@devmentor/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@devmentor/core')>()),
  makeCrudRoute: (options: MakeCrudRouteOptions<UserDto, never, never>) => {
    captured.options = options;
    return { GET: 'GET', POST: 'POST', PUT: 'PUT', DELETE: 'DELETE' };
  },
}));

const route = await import('./route');

function options(): MakeCrudRouteOptions<UserDto, never, never> {
  if (captured.options === undefined) {
    throw new Error('route.ts did not call makeCrudRoute');
  }
  return captured.options;
}

/**
 * A scope opened for `request()` below: the cookie the request carries is the one the
 * scope was opened with, which is the path `requireSession` takes when it reuses the
 * scope's single cached lookup.
 */
function cradle(session: Session | null): Cradle {
  return {
    sessionService: { readCookie: () => 'a.signed.cookie' },
    sessionCookie: 'a.signed.cookie',
    session: Promise.resolve(session),
    userService: { list: async () => [] },
  } as unknown as Cradle;
}

function request(): Request {
  return new Request('http://devmentor.test/api/users');
}

function authorize(session: Session | null): Promise<void> {
  const hook = options().authorize;
  if (hook === undefined) {
    throw new Error('the route exposes no authorize hook');
  }
  return Promise.resolve(hook(request(), cradle(session)));
}

describe('/api/users route configuration', () => {
  it('exports GET and nothing that could create a user', () => {
    expect(Object.keys(route).sort()).toEqual(['GET', 'dynamic']);
    // No `POST` export at all, so Next answers 405 rather than the envelope — and no
    // create schema, so even a re-export could not carry a body into the service.
    expect(route).not.toHaveProperty('POST');
    expect(options().createSchema).toBeUndefined();
    expect(options().updateSchema).toBeUndefined();
  });

  it('is force-dynamic, because it reads the database and the session cookie', () => {
    expect(route.dynamic).toBe('force-dynamic');
  });

  it('resolves the user service from the request scope', () => {
    const scope = cradle(null);

    expect(options().resolve(scope)).toBe(scope.userService);
  });

  it('refuses an anonymous caller with 401', async () => {
    await expect(authorize(null)).rejects.toThrow(UnauthorizedError);
  });

  it.each([['mentee'], ['mentor']] as const)('refuses a signed-in %s with 403', async (role) => {
    await expect(authorize({ userId: 'user-1', roles: [role] })).rejects.toThrow(ForbiddenError);
  });

  it('admits an operator, and an operator who holds other roles too', async () => {
    await expect(authorize({ userId: 'user-1', roles: ['operator'] })).resolves.toBeUndefined();
    await expect(
      authorize({ userId: 'user-1', roles: ['mentee', 'mentor', 'operator'] }),
    ).resolves.toBeUndefined();
  });
});
