import type { Configuration } from '@mikro-orm/core';
import type { AbstractSqlDriver } from '@mikro-orm/postgresql';
import { describe, expect, it } from 'vitest';
import { Migration20260910170021_availability_slots } from '../../migrations/Migration20260910170021_availability_slots';

function migration(): Migration20260910170021_availability_slots {
  return new Migration20260910170021_availability_slots(
    undefined as unknown as AbstractSqlDriver,
    undefined as unknown as Configuration,
  );
}

describe('availability slots migration', () => {
  it('creates the slots table, both indexes, ordering key and cascading relation', () => {
    const subject = migration();

    subject.up();

    expect(subject.name).toBe('Migration20260910170021_availability_slots');
    expect(subject.getQueries()).toEqual([
      'create table "slots" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "mentor_profile_id" uuid not null, "starts_at" timestamptz not null, "removed_at" timestamptz null, primary key ("id"));',
      'create index "slots_mentor_profile_starts_at_index" on "slots" ("mentor_profile_id", "starts_at");',
      'create unique index "slots_active_mentor_profile_starts_at_unique" on "slots" ("mentor_profile_id", "starts_at") where "removed_at" is null;',
      'alter table "mentor_profiles" add "last_published_availability_at" timestamptz null;',
      'alter table "slots" add constraint "slots_mentor_profile_id_foreign" foreign key ("mentor_profile_id") references "mentor_profiles" ("id") on delete cascade;',
    ]);
  });

  it('drops the slots table before removing the mentor ordering key', () => {
    const subject = migration();

    subject.down();

    expect(subject.getQueries()).toEqual([
      'drop table if exists "slots" cascade;',
      'alter table "mentor_profiles" drop column "last_published_availability_at";',
    ]);
  });
});
