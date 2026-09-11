import { defineEntity, type InferEntity } from '@mikro-orm/core';
import { baseProperties } from '../base.entity';
import { defineSingletonEntity } from '../define';
import { MentorProfile } from '../mentors/mentor-profile.entity';

const p = defineEntity.properties;

/**
 * One mentor-published availability instant.
 *
 * Removal is retained as history rather than deleting the row. The partial unique
 * index therefore arbitrates only active publications and permits the same instant
 * to be published again after removal. Booking ownership deliberately lives on the
 * future `Booking` entity; a slot never points at a booking.
 */
export const Slot = defineSingletonEntity('Slot', () =>
  defineEntity({
    name: 'Slot',
    tableName: 'slots',
    properties: {
      ...baseProperties,
      mentorProfile: () => p.manyToOne(MentorProfile).deleteRule('cascade'),
      startsAt: p.datetime(),
      removedAt: p.datetime().nullable(),
    },
    uniques: [
      {
        name: 'slots_active_mentor_profile_starts_at_unique',
        properties: ['mentorProfile', 'startsAt'],
        where: { removedAt: null },
      },
    ],
    indexes: [
      {
        name: 'slots_mentor_profile_starts_at_index',
        properties: ['mentorProfile', 'startsAt'],
      },
    ],
  }),
);

export type ISlot = InferEntity<typeof Slot>;
