import { defineReadiness } from '../../domain/readiness';
import type { StackTag } from '../../domain/vocabularies/stack-tags';

export interface MentorPageReadinessInput {
  publicWorkUrl: string | null;
  bio: string | null;
  stackTags: readonly StackTag[];
}

export const mentorPagePublishable = defineReadiness<
  MentorPageReadinessInput,
  'publicWorkUrl' | 'bio' | 'stackTags'
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
  {
    key: 'stackTags',
    label: 'Choose at least one technology.',
    met: ({ stackTags }) => stackTags.length > 0,
  },
]);
