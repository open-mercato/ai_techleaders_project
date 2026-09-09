import type { EntityProperty } from '@mikro-orm/core';
import { describe, expect, it } from 'vitest';
import { MentorProfile } from '../mentors/mentor-profile.entity';
import { ROLES } from './roles';
import { User } from './user.entity';

/**
 * `init()` replaces a scalar property's `type` string with the resolved `Type` class, so
 * the readable assertion is on the class name.
 */
function typeName(property: EntityProperty): string {
  const { type } = property as unknown as { type: string | { name: string } };
  return typeof type === 'string' ? type : type.name;
}

// `init()` resolves the schema the way discovery does, including the lazy per-property
// thunks. Every assertion below is on the mapping the schema generator turns into DDL,
// so a change that would silently alter the `users` table fails here rather than in a
// migration diff nobody reads.
const meta = User.init().meta;
const properties = meta.properties;

describe('User entity', () => {
  it('maps to the users table', () => {
    expect(meta.className).toBe('User');
    expect(meta.tableName).toBe('users');
  });

  it('stores roles as a native text[] of the Role union, defaulting to mentee', () => {
    // `p.enum(ROLES).array()` is what produces `text[]`: `p.string().array()` would give
    // `varchar(255)[]` and `p.json()` would give `jsonb`, and both break `@>` querying.
    expect(typeName(properties.roles)).toBe('enum');
    expect(properties.roles.array).toBe(true);
    expect(properties.roles.items).toEqual([...ROLES]);
    expect(properties.roles.default).toEqual(['mentee']);
    expect(properties.roles.nullable).toBeFalsy();
  });

  it('declares the non-empty roles check at entity level with an explicit name', () => {
    // Explicit name because the property-level membership check generated from `items`
    // already claims the conventional `users_roles_check`; two checks with one name make
    // schema creation fail. `cardinality`, not `array_length`, because
    // `array_length('{}', 1)` is NULL and a CHECK passes on NULL.
    expect(meta.checks).toEqual([
      { name: 'users_roles_non_empty', expression: 'cardinality("roles") >= 1' },
    ]);
  });

  it('keeps email unique and adds a unique, nullable github id', () => {
    expect(properties.email.unique).toBe(true);
    expect(properties.githubId.unique).toBe(true);
    expect(properties.githubId.nullable).toBe(true);
    expect(properties.githubId.length).toBe(64);
  });

  it('carries the remaining identity columns as nullable, unindexed data', () => {
    expect(properties.githubLogin.length).toBe(64);
    expect(properties.githubLogin.nullable).toBe(true);
    expect(properties.githubLogin.unique).toBeFalsy();
    expect(typeName(properties.avatarUrl)).toBe('TextType');
    expect(properties.avatarUrl.nullable).toBe(true);
    expect(typeName(properties.emailVerifiedAt)).toBe('DateTimeType');
    expect(properties.emailVerifiedAt.nullable).toBe(true);
  });

  it('starts every session version at zero and never allows null', () => {
    expect(typeName(properties.sessionVersion)).toBe('IntegerType');
    expect(properties.sessionVersion.default).toBe(0);
    expect(properties.sessionVersion.nullable).toBeFalsy();
  });

  it('resolves the lazy mentor profile thunk to the inverse side of the 1:1', () => {
    expect(properties.mentorProfile.kind).toBe('1:1');
    expect(properties.mentorProfile.mappedBy).toBe('user');
    expect(properties.mentorProfile.nullable).toBe(true);
    expect(properties.mentorProfile.entity).toBeDefined();
    expect(MentorProfile.meta.className).toBe('MentorProfile');
  });
});
