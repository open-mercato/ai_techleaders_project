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

describe('MentorProfile Connect surface', () => {
  const connectProperties = MentorProfile.init().meta.properties;

  it('knows only whether a transfer may be attempted, and where to send it', () => {
    // All of Connect this epic adds. Onboarding is E02-S05 (#19).
    expect(connectProperties.stripeConnectAccountId!.nullable).toBe(true);
    expect(connectProperties.payoutsEnabled!.default).toBe(false);
    expect(connectProperties.payoutsEnabled!.nullable).toBeFalsy();
  });
});

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

  it('stores draft and publication fields without requiring a slug before publication', () => {
    expect(properties.slug.length).toBe(60);
    expect(properties.slug.nullable).toBe(true);
    expect(properties.slug.unique).toBe(true);
    expect(typeName(properties.publicWorkUrl)).toBe('TextType');
    expect(properties.publicWorkUrl.nullable).toBe(true);
    expect(properties.stackTags.array).toBe(true);
    expect(properties.stackTags.default).toEqual([]);
    expect(typeName(properties.publishedAt)).toBe('DateTimeType');
    expect(properties.publishedAt.nullable).toBe(true);
    expect(meta.checks).toContainEqual({
      name: 'mentor_profiles_publication_has_slug',
      expression: '"published_at" is null or "slug" is not null',
    });
  });

  it('stores the latest published availability instant as an optional ordering key', () => {
    expect(typeName(properties.lastPublishedAvailabilityAt)).toBe('DateTimeType');
    expect(properties.lastPublishedAvailabilityAt.nullable).toBe(true);
  });

  it('stores both optional prices as positive PostgreSQL integers', () => {
    expect(typeName(properties.price25Cents)).toBe('IntegerType');
    expect(properties.price25Cents.fieldNames).toEqual(['price_25_cents']);
    expect(properties.price25Cents.nullable).toBe(true);
    expect(typeName(properties.price50Cents)).toBe('IntegerType');
    expect(properties.price50Cents.fieldNames).toEqual(['price_50_cents']);
    expect(properties.price50Cents.nullable).toBe(true);
    expect(meta.checks).toContainEqual({
      name: 'mentor_profiles_price_25_positive',
      expression: '"price_25_cents" > 0',
    });
    expect(meta.checks).toContainEqual({
      name: 'mentor_profiles_price_50_positive',
      expression: '"price_50_cents" > 0',
    });
  });
});
