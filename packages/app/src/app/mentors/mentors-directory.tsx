'use client';

import { useRouter } from 'next/navigation';
import type { MentorListingDto } from '@devmentor/core';
import { Button, MentorDirectory, MentorListingCard, priceLabel } from '@devmentor/ui';
import { EmptyState } from '@devmentor/ui/backend';

export interface MentorsDirectoryProps {
  mentors: MentorListingDto[];
  /** Every tag the product offers, not only the ones currently represented. */
  tags: string[];
  activeTag: string | null;
}

/** `?tag=` is the page's state, so a filter click is a navigation, not local state. */
export function tagHref(tag: string | null): string {
  return tag === null ? '/mentors' : `/mentors?tag=${encodeURIComponent(tag)}`;
}

/**
 * The client half of the public mentor list (#20).
 *
 * It exists only because `MentorDirectory` reports a filter choice through a callback.
 * Keeping the filter in the URL rather than in component state is what lets a mentee
 * share or reload a filtered list, and it is why the page itself stays a Server
 * Component that reads `?tag=`.
 */
export function MentorsDirectory({ mentors, tags, activeTag }: MentorsDirectoryProps) {
  const router = useRouter();

  return <MentorDirectory
    stacks={tags}
    selectedStack={activeTag}
    onStackChange={(tag) => router.push(tagHref(tag))}
    resultCount={mentors.length}
    empty={<EmptyState
      title={activeTag === null
        ? 'No mentors are bookable yet'
        : `No mentors with ${activeTag} are bookable right now`}
      description={activeTag === null
        ? 'A mentor appears here once they publish their page, their prices and a time.'
        : 'Choose another technology, or clear the filter to see everyone who is bookable.'}
      action={activeTag === null
        ? undefined
        : <Button intent="neutral" appearance="stroke" onClick={() => router.push(tagHref(null))}>
            Clear filter
          </Button>}
    />}
  >
    {mentors.map((mentor) => <MentorListingCard
      key={mentor.slug}
      name={mentor.displayName}
      // The product collects one plain description and no separate headline (R04), so the
      // card's subtitle slot carries it.
      headline={mentor.bio}
      initials={initialsFor(mentor.displayName)}
      stacks={[...mentor.stackTags]}
      price25={priceLabel(mentor.prices.price25Cents, mentor.prices.currency)}
      price50={priceLabel(mentor.prices.price50Cents, mentor.prices.currency)}
      nextAvailableAt={mentor.nextAvailableAt}
      profileHref={`/m/${mentor.slug}`}
    />)}
  </MentorDirectory>;
}

/** First letter of the first two words — the avatar is decorative, so this need not be clever. */
function initialsFor(displayName: string): string {
  return displayName
    .split(/\s+/)
    .filter((part) => part.length > 0)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('');
}
