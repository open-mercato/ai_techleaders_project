import type { Configuration } from '@mikro-orm/core';
import type { AbstractSqlDriver } from '@mikro-orm/postgresql';
import { describe, expect, it } from 'vitest';
import { Migration20260914091936_sessions } from '../../migrations/Migration20260914091936_sessions';

function migration(): Migration20260914091936_sessions {
  return new Migration20260914091936_sessions(
    undefined as unknown as AbstractSqlDriver,
    undefined as unknown as Configuration,
  );
}

describe('sessions migration', () => {
  it('creates the transcript table, its read index, both relations and the length bound', () => {
    const subject = migration();

    subject.up();

    expect(subject.name).toBe('Migration20260914091936_sessions');
    expect(subject.getQueries()).toEqual([
      'create table "session_messages" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "booking_id" uuid not null, "author_id" uuid not null, "body" text not null, primary key ("id"));',
      'create index "session_messages_booking_created_at_index" on "session_messages" ("booking_id", "created_at");',
      'alter table "session_messages" add constraint "session_messages_booking_id_foreign" foreign key ("booking_id") references "bookings" ("id") on delete cascade;',
      'alter table "session_messages" add constraint "session_messages_author_id_foreign" foreign key ("author_id") references "users" ("id") on delete restrict;',
      'alter table "session_messages" add constraint "session_messages_body_length" check (length("body") >= 1 and length("body") <= 4000);',
    ]);
  });

  it('is reversible by dropping the table it added and nothing else', () => {
    const subject = migration();

    subject.down();

    expect(subject.getQueries()).toEqual(['drop table if exists "session_messages" cascade;']);
  });
});
