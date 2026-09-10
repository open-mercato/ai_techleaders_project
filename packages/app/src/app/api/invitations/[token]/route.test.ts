import type { ApiRouteContext, Cradle } from '@devmentor/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({ withRequestScope: vi.fn(), lookup: vi.fn() }));
vi.mock('@devmentor/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@devmentor/core')>()),
  withRequestScope: harness.withRequestScope,
}));

const route = await import('./route');

function context(params: Record<string, string | string[]>): ApiRouteContext {
  return { params: Promise.resolve(params) };
}

beforeEach(() => {
  vi.clearAllMocks();
  harness.withRequestScope.mockImplementation(
    (_req: Request, run: (cradle: Cradle) => unknown) =>
      run({ invitationService: { lookup: harness.lookup } } as unknown as Cradle),
  );
});

describe('GET /api/invitations/[token]', () => {
  it('is dynamic and returns the public invitation envelope', async () => {
    harness.lookup.mockResolvedValue({
      email: 'ada@example.com',
      stackTags: ['TypeScript'],
      expiresAt: '2026-09-24T12:00:00.000Z',
    });
    const response = await route.GET(
      new Request('https://devmentor.test/api/invitations/raw-token'),
      context({ token: 'raw-token' }),
    );
    expect(route.dynamic).toBe('force-dynamic');
    expect(harness.lookup).toHaveBeenCalledWith('raw-token');
    await expect(response.json()).resolves.toEqual({
      ok: true,
      data: {
        email: 'ada@example.com',
        stackTags: ['TypeScript'],
        expiresAt: '2026-09-24T12:00:00.000Z',
      },
    });
  });

  it.each([{} as Record<string, string | string[]>, { token: ['one', 'two'] }])(
    'returns the non-enumerating invalid answer for malformed params %#',
    async (params) => {
      const response = await route.GET(
        new Request('https://devmentor.test/api/invitations/bad'),
        context(params),
      );
      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toMatchObject({
        ok: false,
        error: { code: 'not_found', message: 'This invitation is not valid.' },
      });
    },
  );
});
