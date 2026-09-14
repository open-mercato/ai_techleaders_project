import type { Configuration } from '@mikro-orm/core';
import type { AbstractSqlDriver } from '@mikro-orm/postgresql';
import { describe, expect, it } from 'vitest';
import { Migration20260914080328_notifications } from '../../migrations/Migration20260914080328_notifications';

function migration(): Migration20260914080328_notifications {
  return new Migration20260914080328_notifications(
    undefined as unknown as AbstractSqlDriver,
    undefined as unknown as Configuration,
  );
}

describe('notifications migration', () => {
  it('creates the table, its unread index and both cascading relations', () => {
    const subject = migration();

    subject.up();

    expect(subject.name).toBe('Migration20260914080328_notifications');
    expect(subject.getQueries()).toEqual([
      'create table "notifications" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "user_id" uuid not null, "booking_id" uuid null, "kind" text not null, "read_at" timestamptz null, primary key ("id"));',
      'create index "notifications_user_read_at_index" on "notifications" ("user_id", "read_at");',
      'alter table "notifications" add constraint "notifications_user_id_foreign" foreign key ("user_id") references "users" ("id") on delete cascade;',
      'alter table "notifications" add constraint "notifications_booking_id_foreign" foreign key ("booking_id") references "bookings" ("id") on delete cascade;',
      `alter table "notifications" add constraint "notifications_kind_check" check ("kind" in ('booking_confirmed', 'booking_cancelled'));`,
    ]);
  });

  it('is reversible by dropping the table it added and nothing else', () => {
    const subject = migration();

    subject.down();

    expect(subject.getQueries()).toEqual(['drop table if exists "notifications" cascade;']);
  });
});
