import { defineEntity, type InferEntity } from '@mikro-orm/core';
import { baseProperties } from '../base.entity';
import { defineSingletonEntity } from '../define';
import { MentorProfile } from '../mentors/mentor-profile.entity';
import { ROLES } from './roles';

const p = defineEntity.properties;

/**
 * Application user — identity and authorization state. A user may optionally have a
 * `MentorProfile` (1:1).
 *
 * `roles` is a native `text[]`: `p.enum(ROLES).array()` is the only builder shape that
 * produces one. `p.string().array()` yields `varchar(255)[]` and `p.json<Role[]>()`
 * yields `jsonb`; both silently break `@>` membership querying. Do not add
 * `.$type<Role[]>()` — `InferEntity` already infers `Role[]`, and the cast double-wraps
 * it to `Role[][]`. Membership queries need an explicit operator:
 * `{ roles: { $contains: ['operator'] } }`.
 *
 * Two `CHECK`s guard the column. Membership is generated from `ROLES` by the schema
 * generator (`"roles" <@ array[...]`); non-emptiness is declared at entity level with an
 * explicit name, because a second property-level `.check()` would collide with the
 * generated one on the conventional name `users_roles_check`. It uses `cardinality`, not
 * `array_length`: `array_length('{}', 1)` is `NULL` and a `CHECK` passes on `NULL`, so
 * the `array_length` form lets an empty array straight through. Duplicate members are
 * deliberately *not* rejected — a `CHECK` cannot contain a subquery, so that stays an
 * application invariant (duplicates are benign for a set membership test).
 *
 * `email` is unique and **never updated after creation**: it is the link key between a
 * password account and a GitHub identity, and under the live operator check it is the
 * authorization key. `emailVerifiedAt` gates that linking, so it lands here rather than
 * with the password columns. `sessionVersion` is bumped to revoke every session a user
 * holds.
 *
 * `passwordHash` is **nullable because a GitHub-only account has no password**: a row with
 * `githubId` set and `passwordHash` null is the normal shape for everyone who signed in
 * through GitHub, and registering that address with a password is refused with a 409 rather
 * than filling the column in. The reverse — `passwordHash` set, `githubId` null — is the
 * password account that has never linked GitHub. Neither is an anomaly, so the column
 * cannot be `not null`.
 *
 * It is `text`, not `varchar(60)`: 60 is bcrypt's output width, and pinning the column to
 * it would pin the schema to an algorithm this project does not use and close the
 * `argon2id` upgrade path. The value is an encoded, self-describing digest whose length is
 * the hashing service's business, not the schema's.
 *
 * **It never reaches a DTO.** `UserDto` gains `roles`, `githubLogin` and `avatarUrl`; it
 * never gains `passwordHash`. The hash never leaves the server, never travels in a token or
 * a URL, and `createLogger` censors the `passwordHash` key as a backstop. Adding it to a
 * serialized shape is a review blocker, not a preference.
 */
export const User = defineSingletonEntity('User', () =>
  defineEntity({
    name: 'User',
    tableName: 'users',
    properties: {
      ...baseProperties,
      email: p.string().unique(),
      displayName: p.string(),
      roles: p.enum(ROLES).array().default(['mentee']),
      githubId: p.string().length(64).nullable().unique(),
      githubLogin: p.string().length(64).nullable(),
      avatarUrl: p.text().nullable(),
      emailVerifiedAt: p.datetime().nullable(),
      passwordHash: p.text().nullable(),
      sessionVersion: p.integer().default(0),
      // Per-property thunk so the cross-entity reference is resolved lazily at
      // discovery time, avoiding the circular-import pitfall between the two files.
      mentorProfile: () => p.oneToOne(MentorProfile).mappedBy('user').nullable(),
    },
    checks: [
      { name: 'users_roles_non_empty', expression: 'cardinality("roles") >= 1' },
    ],
  }),
);

export type IUser = InferEntity<typeof User>;
