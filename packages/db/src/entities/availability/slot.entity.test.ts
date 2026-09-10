import type { EntityProperty } from '@mikro-orm/core';
import { describe, expect, it } from 'vitest';
import { entities } from '../index';
import { MentorProfile } from '../mentors/mentor-profile.entity';
import { Slot } from './slot.entity';

function typeName(property: EntityProperty): string {
  const { type } = property as unknown as { type: string | { name: string } };
  return typeof type === 'string' ? type : type.name;
}

const meta = Slot.init().meta;
const properties = meta.properties;

describe('Slot entity', () => {
  it('maps only availability and removal state in addition to the shared fields', () => {
    expect(meta.className).toBe('Slot');
    expect(meta.tableName).toBe('slots');
    expect(Object.keys(properties).sort()).toEqual([
      'createdAt',
      'id',
      'mentorProfile',
      'removedAt',
      'startsAt',
      'updatedAt',
    ]);
    expect(properties).not.toHaveProperty('booking');
    expect(properties).not.toHaveProperty('bookingId');
  });

  it('is registered for ORM discovery', () => {
    expect(entities).toContain(Slot);
  });

  it('belongs to a mentor profile and cascades when that profile is deleted', () => {
    expect(properties.mentorProfile.kind).toBe('m:1');
    expect(properties.mentorProfile.nullable).toBeFalsy();
    expect(properties.mentorProfile.deleteRule).toBe('cascade');
    expect(properties.mentorProfile.entity).toBeDefined();
    expect(MentorProfile.meta.className).toBe('MentorProfile');
  });

  it('stores a required start instant and an optional removal instant', () => {
    expect(typeName(properties.startsAt)).toBe('DateTimeType');
    expect(properties.startsAt.nullable).toBeFalsy();
    expect(typeName(properties.removedAt)).toBe('DateTimeType');
    expect(properties.removedAt.nullable).toBe(true);
  });

  it('allows only one active publication per mentor and start while keeping a read index', () => {
    expect(meta.uniques).toEqual([
      {
        name: 'slots_active_mentor_profile_starts_at_unique',
        properties: ['mentorProfile', 'startsAt'],
        where: { removedAt: null },
      },
    ]);
    expect(meta.indexes).toEqual([
      {
        name: 'slots_mentor_profile_starts_at_index',
        properties: ['mentorProfile', 'startsAt'],
      },
    ]);
  });
});
