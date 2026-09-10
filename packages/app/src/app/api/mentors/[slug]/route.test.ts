import type { ApiRouteContext, Cradle, RouteLogic } from '@devmentor/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  logic: undefined as RouteLogic | undefined,
  getPublicBySlug: vi.fn(),
}));

vi.mock('@devmentor/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@devmentor/core')>()),
  apiHandler: (logic: RouteLogic) => {
    state.logic = logic;
    return logic;
  },
  withRequestScope: async (_req: Request, run: (cradle: Cradle) => unknown) =>
    run({ mentorProfileService: { getPublicBySlug: state.getPublicBySlug } } as unknown as Cradle),
}));

const route = await import('./route');

function context(params?: Record<string, string | string[]>): ApiRouteContext {
  return params === undefined
    ? (undefined as unknown as ApiRouteContext)
    : { params: Promise.resolve(params) };
}

beforeEach(() => {
  vi.clearAllMocks();
  state.getPublicBySlug.mockResolvedValue({ slug: 'ada' });
});

describe('GET /api/mentors/[slug]', () => {
  it('is public, dynamic, and reads the first slug segment through the scoped service', async () => {
    const request = new Request('http://test/api/mentors/ada');
    await expect(route.GET(request, context({ slug: ['ada', 'ignored'] }))).resolves.toEqual({
      slug: 'ada',
    });
    expect(route.dynamic).toBe('force-dynamic');
    expect(state.getPublicBySlug).toHaveBeenCalledWith('ada');
  });

  it('passes an ordinary slug and refuses absent params', async () => {
    const request = new Request('http://test/api/mentors/ada');
    await route.GET(request, context({ slug: 'ada' }));
    expect(state.getPublicBySlug).toHaveBeenLastCalledWith('ada');
    await expect(route.GET(request, context())).rejects.toMatchObject({ code: 'not_found' });
    await expect(route.GET(request, context({}))).rejects.toMatchObject({ code: 'not_found' });
  });
});
