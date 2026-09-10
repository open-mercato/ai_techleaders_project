// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiResource } from '@devmentor/ui/backend';
import { MentorOnboardingStatus } from './mentor-onboarding-status';

const harness = vi.hoisted(() => ({ useApiResource: vi.fn() }));
vi.mock('@devmentor/ui/backend', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@devmentor/ui/backend')>()),
  useApiResource: harness.useApiResource,
}));

const reloadDeadline = vi.fn();
const reloadProfile = vi.fn();
const incomplete = {
  readiness: {
    ready: false,
    items: [
      { key: 'publicWorkUrl', label: 'Add a link to your public work.', met: false },
      { key: 'bio', label: 'Write a description of the work you have done.', met: true },
    ],
  },
};

function resource<T>(data: T | undefined, overrides: Partial<ApiResource<T>> = {}): ApiResource<T> {
  return { data, loading: false, error: undefined, reload: vi.fn(), ...overrides };
}

function setResources(
  onboarding: ApiResource<{ initialPublishDueAt: string | null }>,
  profile: ApiResource<typeof incomplete>,
) {
  harness.useApiResource.mockImplementation((path: string) =>
    path.endsWith('/onboarding') ? onboarding : profile);
}

beforeEach(() => {
  vi.clearAllMocks();
  setResources(
    resource({ initialPublishDueAt: '2026-09-24T12:00:00.000Z' }, { reload: reloadDeadline }),
    resource(incomplete, { reload: reloadProfile }),
  );
});
afterEach(cleanup);

describe('MentorOnboardingStatus', () => {
  it('combines the durable deadline with server-evaluated profile readiness and repair links', () => {
    render(<MentorOnboardingStatus />);
    expect(screen.getByText(/Publish at least one bookable session by/)).toBeTruthy();
    expect(harness.useApiResource.mock.calls.map(([path]) => path)).toEqual([
      '/api/mentors/me/onboarding', '/api/mentors/me',
    ]);
    const items = screen.getAllByRole('listitem');
    expect(within(items[0]!).getByRole('link', { name: 'Edit profile' }).getAttribute('href')).toBe('/mentor/profile');
    expect(within(items[1]!).queryByRole('link')).toBeNull();
    expect(screen.getByText('Complete the missing profile details before publishing your page.')).toBeTruthy();
  });

  it('shows a timeless heading and completion guidance after the invitation deadline is cleared', () => {
    setResources(
      resource({ initialPublishDueAt: null }),
      resource({ readiness: { ready: true, items: incomplete.readiness.items.map((item) => ({ ...item, met: true })) } }),
    );
    render(<MentorOnboardingStatus />);
    expect(screen.getByRole('region', { name: 'Complete your mentor profile' })).toBeTruthy();
    expect(screen.getByText('Your profile details are complete. Publish your page when you are ready.')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Edit profile' })).toBeNull();
  });

  it('renders loading and retryable errors in resource order', () => {
    setResources(
      resource<{ initialPublishDueAt: string | null }>(undefined, { loading: true }),
      resource<typeof incomplete>(undefined, { loading: true }),
    );
    const { rerender } = render(<MentorOnboardingStatus />);
    expect(screen.getByRole('status').textContent).toContain('Loading your publication deadline…');

    setResources(
      resource<{ initialPublishDueAt: string | null }>(undefined, { error: 'Could not load the deadline.', reload: reloadDeadline }),
      resource<typeof incomplete>(undefined, { loading: true }),
    );
    rerender(<MentorOnboardingStatus />);
    expect(screen.getByRole('alert').textContent).toContain('Could not load the deadline.');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reloadDeadline).toHaveBeenCalledOnce();

    setResources(
      resource({ initialPublishDueAt: null }),
      resource<typeof incomplete>(undefined, { error: 'Could not load profile.', reload: reloadProfile }),
    );
    rerender(<MentorOnboardingStatus />);
    expect(screen.getByRole('alert').textContent).toContain('Could not load profile.');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reloadProfile).toHaveBeenCalledOnce();
  });
});
