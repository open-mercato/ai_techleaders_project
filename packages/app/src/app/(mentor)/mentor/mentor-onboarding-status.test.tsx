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
const reloadSlots = vi.fn();
const profile = {
  readiness: {
    ready: false,
    items: [
      { key: 'publicWorkUrl', label: 'Add a link to your public work.', met: false },
      { key: 'bio', label: 'Write a description of the work you have done.', met: true },
      { key: 'stackTags', label: 'Choose at least one technology.', met: true },
    ],
  },
  offerReadiness: {
    ready: false,
    items: [
      { key: 'publishedAt', label: 'Publish your mentor page.', met: false },
      { key: 'price25', label: 'Set your 25-minute price.', met: false },
      { key: 'price50', label: 'Set your 50-minute price.', met: true },
    ],
  },
};
const slots = [
  { id: 'past', startsAt: '2026-09-10T11:00:00.000Z', isFuture: false },
  { id: 'future', startsAt: '2026-09-10T13:00:00.000Z', isFuture: true },
];

function resource<T>(data: T | undefined, overrides: Partial<ApiResource<T>> = {}): ApiResource<T> {
  return { data, loading: false, error: undefined, reload: vi.fn(), ...overrides };
}

type Onboarding = { initialPublishDueAt: string | null };
type Profile = {
  readiness: typeof profile.readiness;
  offerReadiness?: typeof profile.offerReadiness;
};
type Slots = { id: string; startsAt: string; isFuture?: boolean }[];

function setResources(
  onboarding: ApiResource<Onboarding>, ownerProfile: ApiResource<Profile>, ownerSlots: ApiResource<Slots>,
) {
  harness.useApiResource.mockImplementation((path: string) => {
    if (path.endsWith('/onboarding')) return onboarding;
    if (path.endsWith('/slots')) return ownerSlots;
    return ownerProfile;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  setResources(
    resource({ initialPublishDueAt: '2026-09-24T12:00:00.000Z' }, { reload: reloadDeadline }),
    resource(profile, { reload: reloadProfile }),
    resource(slots, { reload: reloadSlots }),
  );
});
afterEach(cleanup);

describe('MentorOnboardingStatus', () => {
  it('combines both server gates with server-clock future availability and exact repair routes', () => {
    render(<MentorOnboardingStatus />);
    expect(screen.getByText(/Publish at least one bookable session by/)).toBeTruthy();
    expect(harness.useApiResource.mock.calls.map(([path]) => path)).toEqual([
      '/api/mentors/me/onboarding', '/api/mentors/me', '/api/availability/slots',
    ]);
    const items = screen.getAllByRole('listitem');
    expect(items.map((item) => within(item).getByRole('heading').textContent)).toEqual([
      'Add a link to your public work.', 'Write a description of the work you have done.',
      'Choose at least one technology.', 'Publish your mentor page.',
      'Set your 25-minute price.', 'Set your 50-minute price.',
      'Publish at least one future available time.',
    ]);
    expect(within(items[0]!).getByRole('link', { name: 'Edit profile' }).getAttribute('href')).toBe('/mentor/profile');
    expect(within(items[1]!).queryByRole('link')).toBeNull();
    expect(within(items[3]!).getByRole('link', { name: 'Publish page' }).getAttribute('href')).toBe('/mentor/profile');
    expect(within(items[4]!).getByRole('link', { name: 'Set prices' }).getAttribute('href')).toBe('/mentor/prices');
    expect(within(items[5]!).queryByRole('link')).toBeNull();
    expect(within(items[6]!).queryByRole('link')).toBeNull();
    expect(screen.getByText('Complete every requirement so developers can find your offer and request a session.')).toBeTruthy();
  });

  it('shows timeless complete guidance only when every page, offer and slot item is met', () => {
    const pageItems = profile.readiness.items.map((item) => ({ ...item, met: true }));
    const offerItems = profile.offerReadiness.items.map((item) => ({ ...item, met: true }));
    setResources(
      resource({ initialPublishDueAt: null }),
      resource({ readiness: { ready: true, items: pageItems }, offerReadiness: { ready: true, items: offerItems } }),
      resource(slots),
    );
    render(<MentorOnboardingStatus />);
    expect(screen.getByRole('region', { name: 'Complete your bookable offer' })).toBeTruthy();
    expect(screen.getByText('Your page, prices and future availability are ready to share.')).toBeTruthy();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('does not treat past or legacy owner slots as future', () => {
    setResources(
      resource({ initialPublishDueAt: null }), resource(profile),
      resource([
        { id: 'past', startsAt: '2099-01-01T00:00:00.000Z', isFuture: false },
        { id: 'legacy', startsAt: '2099-01-02T00:00:00.000Z' },
      ]),
    );
    render(<MentorOnboardingStatus />);
    const future = screen.getAllByRole('listitem').at(-1)!;
    expect(within(future).getByRole('link', { name: 'Add time' }).getAttribute('href')).toBe('/mentor/slots');
  });

  it('renders loading and retryable errors in resource order', () => {
    setResources(
      resource<Onboarding>(undefined, { loading: true }),
      resource<Profile>(undefined, { loading: true }), resource<Slots>(undefined, { loading: true }),
    );
    const { rerender } = render(<MentorOnboardingStatus />);
    expect(screen.getByRole('status').textContent).toContain('Loading your publication deadline…');

    setResources(
      resource<Onboarding>(undefined, { error: 'Could not load the deadline.', reload: reloadDeadline }),
      resource<Profile>(undefined, { loading: true }), resource<Slots>(undefined, { loading: true }),
    );
    rerender(<MentorOnboardingStatus />);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reloadDeadline).toHaveBeenCalledOnce();

    setResources(
      resource({ initialPublishDueAt: null }),
      resource<Profile>(undefined, { error: 'Could not load profile.', reload: reloadProfile }),
      resource<Slots>(undefined, { loading: true }),
    );
    rerender(<MentorOnboardingStatus />);
    expect(screen.getByRole('alert').textContent).toContain('Could not load profile.');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reloadProfile).toHaveBeenCalledOnce();

    setResources(
      resource({ initialPublishDueAt: null }), resource(profile),
      resource<Slots>(undefined, { error: 'Could not load times.', reload: reloadSlots }),
    );
    rerender(<MentorOnboardingStatus />);
    expect(screen.getByRole('alert').textContent).toContain('Could not load times.');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reloadSlots).toHaveBeenCalledOnce();
  });

  it('fails closed and reloads the profile when live offer readiness is absent', () => {
    setResources(
      resource({ initialPublishDueAt: null }),
      resource({ ...profile, offerReadiness: undefined }, { reload: reloadProfile }),
      resource(slots),
    );
    render(<MentorOnboardingStatus />);
    expect(screen.getByRole('alert').textContent).toContain('Offer readiness is unavailable.');
    expect(screen.queryByRole('list')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reloadProfile).toHaveBeenCalledOnce();
  });
});
