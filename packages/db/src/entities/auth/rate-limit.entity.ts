import { defineEntity, type InferEntity } from '@mikro-orm/core';
import { defineSingletonEntity } from '../define';

const p = defineEntity.properties;

/**
 * One fixed-window rate-limit counter — platform primitives **B8**.
 *
 * **The one entity in this schema that deliberately does not spread `baseProperties`,
 * and the reason is written here so nobody "fixes" it.** `baseProperties` gives every
 * domain row a random uuid primary key plus `created_at`/`updated_at`. This is not a
 * domain row: it is a counter addressed by a natural, already-unique text key, written
 * on the hottest unauthenticated path in the app (every sign-in, registration and
 * verification resend attempt, successful or not).
 *
 * - A uuid `id` would be a second key nothing ever looks up, and would force the upsert
 *   in `core/src/http/rate-limit.ts` to conflict on a *unique index* over `key` rather
 *   than on the primary key — one more index to write on every attempt.
 * - `created_at` is `window_start` under another name, and would immediately disagree
 *   with it the first time a window rolled over.
 * - `updated_at` is what `count` already is: proof the row was touched.
 *
 * So the table is exactly `(key, window_start, count)`. Rows are disposable — every
 * `consume` deletes everything older than the longest configured window — which is the
 * other half of why timestamps-for-auditing would be pointless here.
 *
 * **`key` carries no personal data.** It is `<scope>:<kind>:<sha256hex>` where the
 * hashed part is a lower-cased email address or a client IP, so an operator reading this
 * table (or a backup of it) learns how often a bucket was hit and nothing about who is in
 * it. Lower-casing before hashing keeps `A@x` and `a@x` in one bucket. The composition of
 * that string lives in `rate-limit.ts`; the column is plain `text` because a hex digest
 * plus a scope has no interesting width to pin.
 *
 * `window_start` is indexed for the pruning delete, which is the only query that does not
 * go through the primary key.
 *
 * **No entity API ever touches this table.** `RateLimiter` issues one raw
 * `INSERT … ON CONFLICT … RETURNING` through `em.execute`, because the check-and-increment
 * has to be a single atomic statement. The entity exists so the schema is generated,
 * diffed and migrated like everything else — not as a repository target.
 */
export const AuthRateLimit = defineSingletonEntity('AuthRateLimit', () =>
  defineEntity({
    name: 'AuthRateLimit',
    tableName: 'auth_rate_limits',
    properties: {
      key: p.text().primary(),
      windowStart: p.datetime().index(),
      count: p.integer(),
    },
  }),
);

export type IAuthRateLimit = InferEntity<typeof AuthRateLimit>;
