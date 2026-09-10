import type { Cradle, OwnedActionOptions } from '@devmentor/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const harness = vi.hoisted(() => ({
  options: undefined as OwnedActionOptions<unknown> | undefined,
  onboarding: vi.fn(),
}));

vi.mock('@devmentor/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@devmentor/core')>()),
  ownedAction: (options: OwnedActionOptions<unknown>) => {
    harness.options = options;
    return (req: Request) =>
      options.run(
        req,
        { invitationService: { onboarding: harness.onboarding } } as unknown as Cradle,
        undefined,
      );
  },
}));

const route = await import('./route');

beforeEach(() => {
  vi.clearAllMocks();
  harness.onboarding.mockResolvedValue({ initialPublishDueAt: '2026-09-24T12:00:00.000Z' });
});

describe('GET /api/mentors/me/onboarding', () => {
  it('is a dynamic mentor-owned read backed by the scoped service', async () => {
    await expect(
      route.GET(
        new Request('https://devmentor.test/api/mentors/me/onboarding'),
        { params: Promise.resolve({}) },
      ),
    ).resolves.toEqual({ initialPublishDueAt: '2026-09-24T12:00:00.000Z' });
    expect(route.dynamic).toBe('force-dynamic');
    expect(harness.options?.role).toBe('mentor');
    expect(harness.onboarding).toHaveBeenCalledOnce();
  });
});
