import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NotFoundError } from '@devmentor/core';
import { MentorPageView } from '@devmentor/ui/components/mentors/MentorPageView';
import { elements } from '../../../test/element-tree';

class NotFoundSentinel extends Error {}

const harness = vi.hoisted(() => ({
  withScope: vi.fn(),
  getPublicBySlug: vi.fn(),
  notFound: vi.fn(() => { throw new NotFoundSentinel('NEXT_NOT_FOUND'); }),
}));

vi.mock('@devmentor/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@devmentor/core')>()),
  withScope: harness.withScope,
}));
vi.mock('next/navigation', () => ({ notFound: harness.notFound }));

const { default: PublicMentorPage } = await import('./page');

const profile = {
  displayName: 'Ada Lovelace',
  publicWorkUrl: 'https://example.com/ada',
  bio: 'I help developers reason about systems.',
  stackTags: ['TypeScript', 'AI agents'] as const,
  slug: 'ada-lovelace',
};

beforeEach(() => {
  vi.clearAllMocks();
  harness.getPublicBySlug.mockResolvedValue(profile);
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
