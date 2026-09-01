import { defineEntity, type InferEntity } from '@mikro-orm/core';
import { baseProperties } from './base.entity';
import { defineSingletonEntity } from './define';
import { MentorProfile } from './mentor-profile.entity';

const p = defineEntity.properties;

/**
 * Application user. A user may optionally have a `MentorProfile` (1:1). This is a
 * placeholder domain model that exists to exercise relations, repositories and
 * migrations — real auth/user fields come in a later spec.
 */
export const User = defineSingletonEntity('User', () =>
  defineEntity({
    name: 'User',
    tableName: 'users',
    properties: {
      ...baseProperties,
      email: p.string().unique(),
      displayName: p.string(),
      // Per-property thunk so the cross-entity reference is resolved lazily at
      // discovery time, avoiding the circular-import pitfall between the two files.
      mentorProfile: () => p.oneToOne(MentorProfile).mappedBy('user').nullable(),
    },
  }),
);

export type IUser = InferEntity<typeof User>;
