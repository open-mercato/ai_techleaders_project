import { defineEntity, type InferEntity } from '@mikro-orm/core';
import { baseProperties } from '../base.entity';
import { defineSingletonEntity } from '../define';
import { User } from '../auth/user.entity';

const p = defineEntity.properties;

/**
 * Mentor-facing profile owned by a `User` (the owning side of the 1:1, so the FK
 * lives here). Placeholder fields — the real mentor domain is a later spec.
 */
export const MentorProfile = defineSingletonEntity('MentorProfile', () =>
  defineEntity({
    name: 'MentorProfile',
    tableName: 'mentor_profiles',
    properties: {
      ...baseProperties,
      // Per-property thunk (lazy) so the reference to `User` is resolved at discovery
      // time — see the matching note on `User.mentorProfile`.
      user: () =>
        p
          .oneToOne(User)
          .inversedBy('mentorProfile')
          .owner()
          .unique()
          .deleteRule('cascade'),
      headline: p.string(),
      bio: p.text().nullable(),
      yearsOfExperience: p.integer().default(0),
      // Snapshotted from the first accepted invitation. Later invitations may carry a
      // new reporting deadline, but never reset this original mentor obligation.
      initialPublishDueAt: p.datetime().nullable(),
      slug: p.string().length(60).nullable().unique(),
      publicWorkUrl: p.text().nullable(),
      stackTags: p.enum(['TypeScript', 'React', 'Python', 'AI agents'] as const).array().default([]),
      publishedAt: p.datetime().nullable(),
      // Ordering key for mentor discovery. Slot publication updates it in the same
      // transaction as the new active slot; removing a slot never rewrites history.
      lastPublishedAvailabilityAt: p.datetime().nullable(),
    },
    checks: [
      {
        name: 'mentor_profiles_publication_has_slug',
        expression: '"published_at" is null or "slug" is not null',
      },
    ],
  }),
);

export type IMentorProfile = InferEntity<typeof MentorProfile>;
