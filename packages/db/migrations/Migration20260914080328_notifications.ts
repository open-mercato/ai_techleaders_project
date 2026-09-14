import { Migration } from '@mikro-orm/migrations';

/**
 * Add the durable half of telling someone something.
 *
 * The email beside a notification is best-effort — the event bus swallows a failing
 * handler — so this row is what a mentee or a mentor actually relies on. It cascades from
 * both its user and its booking: a notification is a message *about* a record, not the
 * record, and a dangling message is worse than a lost one.
 */
export class Migration20260914080328_notifications extends Migration {
  override name = 'Migration20260914080328_notifications';

  override up(): void | Promise<void> {
    this.addSql(`create table "notifications" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "user_id" uuid not null, "booking_id" uuid null, "kind" text not null, "read_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "notifications_user_read_at_index" on "notifications" ("user_id", "read_at");`);

    this.addSql(`alter table "notifications" add constraint "notifications_user_id_foreign" foreign key ("user_id") references "users" ("id") on delete cascade;`);
    this.addSql(`alter table "notifications" add constraint "notifications_booking_id_foreign" foreign key ("booking_id") references "bookings" ("id") on delete cascade;`);
    this.addSql(`alter table "notifications" add constraint "notifications_kind_check" check ("kind" in ('booking_confirmed', 'booking_cancelled'));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "notifications" cascade;`);
  }
}
