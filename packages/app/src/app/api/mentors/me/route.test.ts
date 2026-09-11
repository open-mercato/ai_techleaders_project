import type {
  Cradle,
  MentorProfileOwnerDto,
  MentorProfileUpdateInput,
  OwnedResourceRouteOptions,
} from '@devmentor/core';
import { describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  options: undefined as OwnedResourceRouteOptions<
    MentorProfileOwnerDto,
    MentorProfileUpdateInput
  > | undefined,
  getOwner: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@devmentor/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@devmentor/core')>()),
  makeOwnedResourceRoute: (
    options: OwnedResourceRouteOptions<MentorProfileOwnerDto, MentorProfileUpdateInput>,
  ) => {
    state.options = options;
    return { GET: 'GET', PUT: 'PUT' };
  },
}));

const route = await import('./route');
const cradle = {
  mentorProfileService: { getOwner: state.getOwner, update: state.update },
} as unknown as Cradle;

describe('GET/PUT /api/mentors/me', () => {
  it('configures the dynamic mentor-owned profile resource and shared schema', async () => {
    expect(route.dynamic).toBe('force-dynamic');
    expect(route.GET).toBe('GET');
    expect(route.PUT).toBe('PUT');
    expect(state.options?.role).toBe('mentor');
    expect(state.options?.updateSchema).toBeDefined();

    state.getOwner.mockResolvedValue({ id: 'profile-1' });
    state.update.mockResolvedValue({ id: 'profile-1', bio: 'New' });
    await expect(
      state.options?.get?.(new Request('http://test'), cradle, undefined),
    ).resolves.toEqual({ id: 'profile-1' });
    await expect(
      state.options?.update?.(new Request('http://test'), cradle, undefined, { bio: 'New' }),
    ).resolves.toEqual({ id: 'profile-1', bio: 'New' });
    expect(state.update).toHaveBeenCalledWith({ bio: 'New' });
  });
});
