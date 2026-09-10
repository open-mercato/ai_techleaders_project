import { defineEntity } from '@mikro-orm/core';

const p = defineEntity.properties;

/**
 * Shared columns for every entity: a random uuid primary key plus created/updated
 * timestamps maintained by the ORM. Concrete entities spread `baseProperties` into
 * their own `properties` map.
 *
 * **The ids are uuid v4, not v7 — they do not sort by creation time.** `crypto.randomUUID()`
 * is v4 by definition and Node has no v7 generator. Order rows by `createdAt` (or `id`
 * only as a stable tiebreaker); never treat a larger id as a later row. Switching to v7
 * would change how every table's primary key is generated, so it needs its own spec and
 * migration rather than a quiet edit here.
 */
export const baseProperties = {
  id: p
    .uuid()
    .onCreate(() => crypto.randomUUID())
    .primary(),
  createdAt: p
    .datetime()
    .onCreate(() => new Date()),
  updatedAt: p
    .datetime()
    .onCreate(() => new Date())
    .onUpdate(() => new Date()),
};
