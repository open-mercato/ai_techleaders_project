import type { EntityProperty } from '@mikro-orm/core';
import { describe, expect, it } from 'vitest';
import { User } from '../auth/user.entity';
import { MentorProfile } from './mentor-profile.entity';

function typeName(property: EntityProperty): string {
  const { type } = property as unknown as { type: string | { name: string } };
  return typeof type === 'string' ? type : type.name;
}

const meta = MentorProfile.init().meta;
const properties = meta.properties;

describe('MentorProfile entity', () => {
  it('keeps the existing profile fields and their defaults', () => {
    expect(meta.tableName).toBe('mentor_profiles');
    expect(properties.headline.nullable).toBeFalsy();
    expect(typeName(properties.bio)).toBe('TextType');
    expect(properties.bio.nullable).toBe(true);
    expect(properties.yearsOfExperience.default).toBe(0);
  });

  it('owns one user through the existing cascading unique relation', () => {
    expect(properties.user.kind).toBe('1:1');
    expect(properties.user.owner).toBe(true);
    expect(properties.user.unique).toBe(true);
    expect(properties.user.deleteRule).toBe('cascade');
    expect(properties.user.entity).toBeDefined();
    expect(User.meta.className).toBe('User');
  });

  it('stores the first invitation publication deadline as an optional instant', () => {
    expect(typeName(properties.initialPublishDueAt)).toBe('DateTimeType');
    expect(properties.initialPublishDueAt.nullable).toBe(true);
  });
});
