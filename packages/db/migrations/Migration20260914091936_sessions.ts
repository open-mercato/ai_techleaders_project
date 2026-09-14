import { Migration } from '@mikro-orm/migrations';

export class Migration20260914091936_sessions extends Migration {

  override name = 'Migration20260914091936_sessions';

  override up(): void | Promise<void> {
    this.addSql(`create table "session_messages" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "booking_id" uuid not null, "author_id" uuid not null, "body" text not null, primary key ("id"));`);
    this.addSql(`create index "session_messages_booking_created_at_index" on "session_messages" ("booking_id", "created_at");`);

    this.addSql(`alter table "session_messages" add constraint "session_messages_booking_id_foreign" foreign key ("booking_id") references "bookings" ("id") on delete cascade;`);
    this.addSql(`alter table "session_messages" add constraint "session_messages_author_id_foreign" foreign key ("author_id") references "users" ("id") on delete restrict;`);
    this.addSql(`alter table "session_messages" add constraint "session_messages_body_length" check (length("body") between 1 and 4000);`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "session_messages" cascade;`);
  }

}
