import { Migration } from '@mikro-orm/migrations';

/**
 * Record what DevMentor keeps and what each mentor is owed (D11, R10, R05).
 *
 * `payouts_booking_id_unique` is what makes the payout run safe to trigger twice: there is
 * no scheduler in this project, so the run is started by hand, and a second row for one
 * session would be a second transfer. The database refuses it.
 *
 * The two `mentor_profiles` columns are all of Connect this epic adds. Onboarding is
 * E02-S05 (#19); a payout decision needs only to know whether a transfer may be attempted
 * and where to send it.
 */
export class Migration20260914084322_fee_split extends Migration {
  override name = 'Migration20260914084322_fee_split';

  override up(): void | Promise<void> {
    this.addSql(`create table "payouts" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "booking_id" uuid not null, "mentor_profile_id" uuid not null, "amount_cents" int not null, "status" text not null default 'held', "held_reason" text null, "stripe_transfer_id" varchar(120) null, primary key ("id"));`);
    this.addSql(`alter table "payouts" add constraint "payouts_booking_id_unique" unique ("booking_id");`);
    this.addSql(`create index "payouts_status_index" on "payouts" ("status");`);

    this.addSql(`alter table "mentor_profiles" add "stripe_connect_account_id" varchar(120) null, add "payouts_enabled" boolean not null default false;`);

    this.addSql(`alter table "bookings" add "fee_percent_applied" int null, add "platform_fee_cents" int null, add "mentor_share_cents" int null;`);

    this.addSql(`alter table "payouts" add constraint "payouts_booking_id_foreign" foreign key ("booking_id") references "bookings" ("id") on delete restrict;`);
    this.addSql(`alter table "payouts" add constraint "payouts_mentor_profile_id_foreign" foreign key ("mentor_profile_id") references "mentor_profiles" ("id") on delete restrict;`);
    this.addSql(`alter table "payouts" add constraint "payouts_amount_cents_non_negative" check ("amount_cents" >= 0);`);
    this.addSql(`alter table "payouts" add constraint "payouts_status_check" check ("status" in ('held', 'transferred', 'failed'));`);
    this.addSql(`alter table "payouts" add constraint "payouts_held_reason_check" check ("held_reason" in ('connect_onboarding_incomplete'));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "payouts" cascade;`);

    this.addSql(`alter table "bookings" drop column "fee_percent_applied", drop column "platform_fee_cents", drop column "mentor_share_cents";`);

    this.addSql(`alter table "mentor_profiles" drop column "stripe_connect_account_id", drop column "payouts_enabled";`);
  }
}
