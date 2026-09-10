import { z } from 'zod';
import { defineVocabulary } from '../vocabulary';

/** The four technology pools approved for 1.0 invitations and mentor discovery. */
export const StackTags = defineVocabulary([
  'TypeScript',
  'React',
  'Python',
  'AI agents',
] as const);

export type StackTag = z.infer<typeof StackTags.schema>;
