import type { ApiRouteContext, Cradle, OwnedActionOptions } from '@devmentor/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  options: undefined as OwnedActionOptions<unknown> | undefined,
  accept: vi.fn(),
  issue: vi.fn(),
}));

vi.mock('@devmentor/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@devmentor/core')>();
  return {
    ...actual,
    ownedAction: (options: OwnedActionOptions<unknown>) => {
      harness.options = options;
      return async (req: Request, ctx: ApiRouteContext) => {
        const params = ctx?.params ? await ctx.params : undefined;
        return options.run(
          req,
          {
            invitationService: { accept: harness.accept },
            sessionService: { issue: harness.issue },
          } as unknown as Cradle,
          params,
        ) as Promise<Response>;
      };
    },
  };
});

const route = await import('./route');

beforeEach(() => {
  vi.clearAllMocks();
  harness.accept.mockResolvedValue({
    userId: 'user-1',
    roles: ['mentee', 'mentor'],
    sessionVersion: 4,
    publishDueAt: '2026-09-24T12:00:00.000Z',
  });
  harness.issue.mockResolvedValue({ cookie: 'devmentor_session=fresh; Path=/' });
});

describe('POST /api/invitations/[token]/accept', () => {
  it('uses an authenticated role-free owned action and reissues the bumped session', async () => {
    const response = await route.POST(
      new Request('https://devmentor.test/api/invitations/raw-token/accept', {
        method: 'POST',
      }),
      { params: Promise.resolve({ token: 'raw-token' }) },
    );
    expect(route.dynamic).toBe('force-dynamic');
    expect(harness.options).not.toHaveProperty('role');
    expect(harness.accept).toHaveBeenCalledWith('raw-token');
    expect(harness.issue).toHaveBeenCalledWith({ id: 'user-1', sessionVersion: 4 });
    expect(response.headers.getSetCookie()).toEqual(['devmentor_session=fresh; Path=/']);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: {
        roles: ['mentee', 'mentor'],
        publishDueAt: '2026-09-24T12:00:00.000Z',
      },
    });
  });

  it.each([undefined, ['one', 'two']])('refuses a malformed token parameter %#', async (token) => {
    await expect(
      route.POST(
        new Request('https://devmentor.test/api/invitations/bad/accept', { method: 'POST' }),
        {
          params: Promise.resolve(
            token === undefined ? ({} as Record<string, string | string[]>) : { token },
          ),
        },
      ),
    ).rejects.toMatchObject({ status: 404, message: 'This invitation is not valid.' });
    expect(harness.accept).not.toHaveBeenCalled();
    expect(harness.issue).not.toHaveBeenCalled();
  });
});
