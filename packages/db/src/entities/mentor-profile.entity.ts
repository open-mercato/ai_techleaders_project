import { defineEntity, type InferEntity } from '@mikro-orm/core';
import { baseProperties } from './base.entity';
import { defineSingletonEntity } from './define';
import { User } from './user.entity';

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
    },
  }),
);

export type IMentorProfile = InferEntity<typeof MentorProfile>;
