import type { Configuration } from '@mikro-orm/core';
import type { AbstractSqlDriver } from '@mikro-orm/postgresql';
import { describe, expect, it } from 'vitest';
import { Migration20260914084322_fee_split } from '../../migrations/Migration20260914084322_fee_split';

function migration(): Migration20260914084322_fee_split {
  return new Migration20260914084322_fee_split(
    undefined as unknown as AbstractSqlDriver,
    undefined as unknown as Configuration,
  );
}

describe('fee split migration', () => {
  it('adds the payout record, the Connect surface and the booking split columns', () => {
    const subject = migration();

    subject.up();

    expect(subject.name).toBe('Migration20260914084322_fee_split');
    expect(subject.getQueries()).toEqual([
      `create table "payouts" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "booking_id" uuid not null, "mentor_profile_id" uuid not null, "amount_cents" int not null, "status" text not null default 'held', "held_reason" text null, "stripe_transfer_id" varchar(120) null, primary key ("id"));`,
      // One payout per session: the run is triggered by hand and may be triggered twice.
      'alter table "payouts" add constraint "payouts_booking_id_unique" unique ("booking_id");',
      'create index "payouts_status_index" on "payouts" ("status");',
      'alter table "mentor_profiles" add "stripe_connect_account_id" varchar(120) null, add "payouts_enabled" boolean not null default false;',
      'alter table "bookings" add "fee_percent_applied" int null, add "platform_fee_cents" int null, add "mentor_share_cents" int null;',
      'alter table "payouts" add constraint "payouts_booking_id_foreign" foreign key ("booking_id") references "bookings" ("id") on delete restrict;',
      'alter table "payouts" add constraint "payouts_mentor_profile_id_foreign" foreign key ("mentor_profile_id") references "mentor_profiles" ("id") on delete restrict;',
      'alter table "payouts" add constraint "payouts_amount_cents_non_negative" check ("amount_cents" >= 0);',
      `alter table "payouts" add constraint "payouts_status_check" check ("status" in ('held', 'transferred', 'failed'));`,
      `alter table "payouts" add constraint "payouts_held_reason_check" check ("held_reason" in ('connect_onboarding_incomplete'));`,
    ]);
  });

  it('is reversible, dropping the payouts table before the rows it references', () => {
    const subject = migration();

    subject.down();

    expect(subject.getQueries()).toEqual([
      'drop table if exists "payouts" cascade;',
      'alter table "bookings" drop column "fee_percent_applied", drop column "platform_fee_cents", drop column "mentor_share_cents";',
      'alter table "mentor_profiles" drop column "stripe_connect_account_id", drop column "payouts_enabled";',
    ]);
  });
});
