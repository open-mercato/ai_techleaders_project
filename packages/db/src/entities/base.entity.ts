import { defineEntity } from '@mikro-orm/core';

const p = defineEntity.properties;

/**
 * Shared columns for every entity: a uuid v7 primary key (time-sortable) plus
 * created/updated timestamps maintained by the ORM. Concrete entities spread
 * `baseProperties` into their own `properties` map.
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
