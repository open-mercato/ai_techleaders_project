import { defineReadiness } from '../../domain/readiness';
import type { StackTag } from '../../domain/vocabularies/stack-tags';

export interface MentorPageReadinessInput {
  publicWorkUrl: string | null;
  bio: string | null;
  stackTags: readonly StackTag[];
}

export const mentorPagePublishable = defineReadiness<
  MentorPageReadinessInput,
  'publicWorkUrl' | 'bio'
>([
  {
    key: 'publicWorkUrl',
    label: 'Add a link to your public work.',
    met: ({ publicWorkUrl }) => publicWorkUrl !== null && publicWorkUrl.trim().length > 0,
  },
  {
    key: 'bio',
    label: 'Write a description of the work you have done.',
    met: ({ bio }) => bio !== null && bio.trim().length > 0,
  },
]);

export interface MentorOfferReadinessInput {
  publishedAt: Date | null;
  price25Cents: number | null;
  price50Cents: number | null;
}

/** Offer readiness is deliberately independent from current bounds and future availability. */
export const mentorOfferReady = defineReadiness<
  MentorOfferReadinessInput,
  'publishedAt' | 'price25' | 'price50'
>([
  {
    key: 'publishedAt',
    label: 'Publish your mentor page.',
    met: ({ publishedAt }) => publishedAt !== null,
  },
  {
    key: 'price25',
    label: 'Set your 25-minute price.',
    met: ({ price25Cents }) => price25Cents !== null,
  },
  {
    key: 'price50',
    label: 'Set your 50-minute price.',
    met: ({ price50Cents }) => price50Cents !== null,
  },
]);
