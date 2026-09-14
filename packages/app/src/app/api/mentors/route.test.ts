import type { ApiRouteContext, Cradle, RouteLogic } from '@devmentor/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  logic: undefined as RouteLogic | undefined,
  listPublished: vi.fn(),
}));

vi.mock('@devmentor/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@devmentor/core')>()),
  apiHandler: (logic: RouteLogic) => {
    state.logic = logic;
    return logic;
  },
  withRequestScope: async (_req: Request, run: (cradle: Cradle) => unknown) =>
    run({ mentorProfileService: { listPublished: state.listPublished } } as unknown as Cradle),
}));

const route = await import('./route');

const noContext = undefined as unknown as ApiRouteContext;

beforeEach(() => {
  vi.clearAllMocks();
  state.listPublished.mockResolvedValue([{ slug: 'ada' }]);
});

describe('GET /api/mentors', () => {
  it('lists every bookable mentor when no tag is asked for', async () => {
    const response = await route.GET(new Request('http://test/api/mentors'), noContext);

    expect(response).toEqual([{ slug: 'ada' }]);
    expect(state.listPublished).toHaveBeenCalledExactlyOnceWith();
    expect(route.dynamic).toBe('force-dynamic');
  });

  it('narrows to a known stack tag', async () => {
    await route.GET(new Request('http://test/api/mentors?tag=AI%20agents'), noContext);

    expect(state.listPublished).toHaveBeenCalledExactlyOnceWith('AI agents');
  });

  it.each(['javascript', ''])('refuses the unknown tag %o instead of ignoring it', async (tag) => {
    const request = new Request(`http://test/api/mentors?tag=${encodeURIComponent(tag)}`);

    await expect(route.GET(request, noContext)).rejects.toMatchObject({
      code: 'validation_failed',
      fieldErrors: {
        tag: ['Filter by one of these technologies: TypeScript, React, Python, AI agents.'],
      },
    });
    expect(state.listPublished).not.toHaveBeenCalled();
  });
});
