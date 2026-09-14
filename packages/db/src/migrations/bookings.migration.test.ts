import type { Configuration } from '@mikro-orm/core';
import type { AbstractSqlDriver } from '@mikro-orm/postgresql';
import { describe, expect, it } from 'vitest';
import { Migration20260914072347_bookings } from '../../migrations/Migration20260914072347_bookings';

function migration(): Migration20260914072347_bookings {
  return new Migration20260914072347_bookings(
    undefined as unknown as AbstractSqlDriver,
    undefined as unknown as Configuration,
  );
}

describe('bookings migration', () => {
  it('creates the booking record, its read indexes, the slot arbiter and every check', () => {
    const subject = migration();

    subject.up();

    expect(subject.name).toBe('Migration20260914072347_bookings');
    expect(subject.getQueries()).toEqual([
      `create table "bookings" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "slot_id" uuid not null, "mentee_id" uuid not null, "mentor_profile_id" uuid not null, "length_minutes" int not null, "price_cents" int not null, "currency" varchar(3) not null, "status" text not null default 'pending', "starts_at" timestamptz not null, "booked_at" timestamptz null, "expires_at" timestamptz null, primary key ("id"));`,
      'create index "bookings_mentee_starts_at_index" on "bookings" ("mentee_id", "starts_at");',
      'create index "bookings_mentor_profile_starts_at_index" on "bookings" ("mentor_profile_id", "starts_at");',
      'create index "bookings_status_expires_at_index" on "bookings" ("status", "expires_at");',
      `create unique index "bookings_active_slot_unique" on "bookings" ("slot_id") where "status" in ('pending', 'confirmed');`,
      'alter table "bookings" add constraint "bookings_slot_id_foreign" foreign key ("slot_id") references "slots" ("id") on delete restrict;',
      'alter table "bookings" add constraint "bookings_mentee_id_foreign" foreign key ("mentee_id") references "users" ("id") on delete restrict;',
      'alter table "bookings" add constraint "bookings_mentor_profile_id_foreign" foreign key ("mentor_profile_id") references "mentor_profiles" ("id") on delete restrict;',
      'alter table "bookings" add constraint "bookings_length_minutes_offered" check ("length_minutes" in (25, 50));',
      'alter table "bookings" add constraint "bookings_price_cents_positive" check ("price_cents" > 0);',
      `alter table "bookings" add constraint "bookings_status_check" check ("status" in ('pending', 'confirmed', 'cancelled', 'expired'));`,
    ]);
  });

  it('is reversible by dropping the table it added and nothing else', () => {
    const subject = migration();

    subject.down();

    expect(subject.getQueries()).toEqual(['drop table if exists "bookings" cascade;']);
  });
});
