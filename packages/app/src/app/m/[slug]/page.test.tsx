import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundError } from '@devmentor/core';
import { MentorPageView } from '@devmentor/ui/components/mentors/MentorPageView';
import { elements } from '../../../test/element-tree';

function panelProps(tree: unknown) {
  const found = elements(tree as never).find((element) => element.type === BookSessionPanel);
  return found?.props as Parameters<typeof BookSessionPanel>[0] | undefined;
}

class NotFoundSentinel extends Error {}

const harness = vi.hoisted(() => ({
  withScope: vi.fn(),
  getPublicBySlug: vi.fn(),
  getPageSession: vi.fn(),
  notFound: vi.fn(() => { throw new NotFoundSentinel('NEXT_NOT_FOUND'); }),
}));

vi.mock('@devmentor/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@devmentor/core')>()),
  withScope: harness.withScope,
}));
vi.mock('next/navigation', () => ({ notFound: harness.notFound }));
vi.mock('../../../lib/session', () => ({ getPageSession: harness.getPageSession }));

const { default: PublicMentorPage } = await import('./page');
const { BookSessionPanel } = await import('./book-session-panel');

const profile = {
  displayName: 'Ada Lovelace',
  publicWorkUrl: 'https://example.com/ada',
  bio: 'I help developers reason about systems.',
  stackTags: ['TypeScript', 'AI agents'] as const,
  slug: 'ada-lovelace',
  prices: { price25Cents: 9_000, price50Cents: 18_000, currency: 'PLN' },
  slots: [
    { id: 'boundary', startsAt: '2026-09-10T18:00:00.000Z', meetsLeadTime: true },
    { id: 'late', startsAt: '2026-09-10T18:30:00.000Z', meetsLeadTime: false },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  harness.getPublicBySlug.mockResolvedValue(profile);
  harness.getPageSession.mockResolvedValue(null);
  harness.withScope.mockImplementation((run: (cradle: unknown) => unknown) => run({
    mentorProfileService: { getPublicBySlug: harness.getPublicBySlug },
  }));
});

describe('/m/[slug] page', () => {
  it('loads the explicit public projection and delegates all mentor markup to MentorPageView', async () => {
    const tree = await PublicMentorPage({ params: Promise.resolve({ slug: 'ada-lovelace' }) });
    expect(harness.getPublicBySlug).toHaveBeenCalledExactlyOnceWith('ada-lovelace');
    const view = elements(tree).find((element) => element.type === MentorPageView);
    expect(view?.props).toEqual({ profile: { ...profile, stackTags: ['TypeScript', 'AI agents'] } });
  });

  it('offers the booking panel the page data and no caller identity beyond the role', async () => {
    const props = panelProps(
      await PublicMentorPage({ params: Promise.resolve({ slug: 'ada-lovelace' }) }),
    );

    expect(props?.mentorSlug).toBe('ada-lovelace');
    expect(props?.mentorName).toBe('Ada Lovelace');
    expect(props?.slots).toEqual(profile.slots);
    expect(props?.prices).toEqual(profile.prices);
    expect(props?.signedInAsMentee).toBe(false);
    expect(props?.initialSlotId).toBeNull();
  });

  it('lets a signed-in mentee reserve and treats a mentor-only session as signed out', async () => {
    harness.getPageSession.mockResolvedValue({ userId: 'u-1', roles: ['mentee'] });
    expect(
      panelProps(await PublicMentorPage({ params: Promise.resolve({ slug: 'ada-lovelace' }) }))
        ?.signedInAsMentee,
    ).toBe(true);

    harness.getPageSession.mockResolvedValue({ userId: 'u-2', roles: ['mentor'] });
    expect(
      panelProps(await PublicMentorPage({ params: Promise.resolve({ slug: 'ada-lovelace' }) }))
        ?.signedInAsMentee,
    ).toBe(false);
  });

  it('carries the chosen time back from sign-in, reading one value from a repeated key', async () => {
    expect(
      panelProps(await PublicMentorPage({
        params: Promise.resolve({ slug: 'ada-lovelace' }),
        searchParams: Promise.resolve({ slot: 'boundary' }),
      }))?.initialSlotId,
    ).toBe('boundary');

    expect(
      panelProps(await PublicMentorPage({
        params: Promise.resolve({ slug: 'ada-lovelace' }),
        searchParams: Promise.resolve({ slot: ['boundary', 'late'] }),
      }))?.initialSlotId,
    ).toBe('boundary');

    expect(
      panelProps(await PublicMentorPage({
        params: Promise.resolve({ slug: 'ada-lovelace' }),
        searchParams: Promise.resolve({ slot: [] }),
      }))?.initialSlotId,
    ).toBeNull();
  });

  it('treats a projection without times or prices as an empty, unbookable offer', async () => {
    const { slots: _slots, prices: _prices, ...bare } = profile;
    harness.getPublicBySlug.mockResolvedValue(bare);

    const props = panelProps(
      await PublicMentorPage({ params: Promise.resolve({ slug: 'ada-lovelace' }) }),
    );

    expect(props?.slots).toEqual([]);
    expect(props?.prices).toBeNull();
  });

  it('turns an unpublished or unknown slug into the framework 404', async () => {
    harness.getPublicBySlug.mockRejectedValue(new NotFoundError('Mentor page not found.'));
    await expect(PublicMentorPage({ params: Promise.resolve({ slug: 'hidden' }) }))
      .rejects.toBeInstanceOf(NotFoundSentinel);
    expect(harness.notFound).toHaveBeenCalledOnce();
  });

  it('does not disguise an unexpected service failure as a missing page', async () => {
    const failure = new Error('database offline');
    harness.getPublicBySlug.mockRejectedValue(failure);
    await expect(PublicMentorPage({ params: Promise.resolve({ slug: 'ada' }) })).rejects.toBe(failure);
    expect(harness.notFound).not.toHaveBeenCalled();
  });
});
