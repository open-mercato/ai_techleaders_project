import { Migration } from '@mikro-orm/migrations';

/**
 * Add the booking record and the index that arbitrates a slot.
 *
 * `bookings_active_slot_unique` is partial on purpose: it covers only `pending` and
 * `confirmed`, so two concurrent reservations on one slot end as one row and one `23505`,
 * while an `expired` or `cancelled` row releases the slot without being deleted.
 */
export class Migration20260914072347_bookings extends Migration {
  override name = 'Migration20260914072347_bookings';

  override up(): void | Promise<void> {
    this.addSql(`create table "bookings" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "slot_id" uuid not null, "mentee_id" uuid not null, "mentor_profile_id" uuid not null, "length_minutes" int not null, "price_cents" int not null, "currency" varchar(3) not null, "status" text not null default 'pending', "starts_at" timestamptz not null, "booked_at" timestamptz null, "expires_at" timestamptz null, primary key ("id"));`);
    this.addSql(`create index "bookings_mentee_starts_at_index" on "bookings" ("mentee_id", "starts_at");`);
    this.addSql(`create index "bookings_mentor_profile_starts_at_index" on "bookings" ("mentor_profile_id", "starts_at");`);
    this.addSql(`create index "bookings_status_expires_at_index" on "bookings" ("status", "expires_at");`);
    this.addSql(`create unique index "bookings_active_slot_unique" on "bookings" ("slot_id") where "status" in ('pending', 'confirmed');`);

    this.addSql(`alter table "bookings" add constraint "bookings_slot_id_foreign" foreign key ("slot_id") references "slots" ("id") on delete restrict;`);
    this.addSql(`alter table "bookings" add constraint "bookings_mentee_id_foreign" foreign key ("mentee_id") references "users" ("id") on delete restrict;`);
    this.addSql(`alter table "bookings" add constraint "bookings_mentor_profile_id_foreign" foreign key ("mentor_profile_id") references "mentor_profiles" ("id") on delete restrict;`);
    this.addSql(`alter table "bookings" add constraint "bookings_length_minutes_offered" check ("length_minutes" in (25, 50));`);
    this.addSql(`alter table "bookings" add constraint "bookings_price_cents_positive" check ("price_cents" > 0);`);
    this.addSql(`alter table "bookings" add constraint "bookings_status_check" check ("status" in ('pending', 'confirmed', 'cancelled', 'expired'));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "bookings" cascade;`);
  }
}
