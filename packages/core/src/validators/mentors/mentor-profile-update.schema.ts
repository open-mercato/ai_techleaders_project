import { z } from 'zod';
import { StackTags } from '../../domain/vocabularies/stack-tags';

const blankToNull = (value: unknown) =>
  typeof value === 'string' && value.trim().length === 0 ? null : value;

const publicWorkUrl = z.preprocess(
  blankToNull,
  z.string().url({ protocol: /^https?$/ }).nullable(),
);
const bio = z.preprocess(blankToNull, z.string().min(1).max(2000).nullable());

export const mentorProfileUpdateSchema = z.object({
  publicWorkUrl: publicWorkUrl.optional(),
  bio: bio.optional(),
  stackTags: z.array(StackTags.schema)
    .max(4)
    .refine((tags) => new Set(tags).size === tags.length, 'Choose each technology only once.')
    .optional(),
});

export type MentorProfileUpdateInput = z.infer<typeof mentorProfileUpdateSchema>;
