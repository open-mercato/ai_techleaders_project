import type { Cradle, OwnedActionOptions } from '@devmentor/core';
import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  options: undefined as OwnedActionOptions<unknown> | undefined,
  unpublish: vi.fn(),
}));

vi.mock('@devmentor/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@devmentor/core')>()),
  ownedAction: (options: OwnedActionOptions<unknown>) => {
    state.options = options;
    return 'POST';
  },
}));

const route = await import('./route');

describe('POST /api/mentors/me/unpublish', () => {
  it('is a dynamic mentor-owned action backed by the profile service', async () => {
    expect(route.dynamic).toBe('force-dynamic');
    expect(route.POST).toBe('POST');
    expect(state.options?.role).toBe('mentor');
    state.unpublish.mockResolvedValue({ slug: 'ada', publishedAt: null });
    const cradle = { mentorProfileService: { unpublish: state.unpublish } } as unknown as Cradle;
    await expect(
      state.options?.run(new Request('http://test'), cradle, undefined),
    ).resolves.toEqual({ slug: 'ada', publishedAt: null });
  });
});
