import type { Configuration } from '@mikro-orm/core';
import type { AbstractSqlDriver } from '@mikro-orm/postgresql';
import { describe, expect, it } from 'vitest';
import { Migration20260914074449_payments } from '../../migrations/Migration20260914074449_payments';

function migration(): Migration20260914074449_payments {
  return new Migration20260914074449_payments(
    undefined as unknown as AbstractSqlDriver,
    undefined as unknown as Configuration,
  );
}

describe('payments migration', () => {
  it('adds the processed-event record and the booking payment columns', () => {
    const subject = migration();

    subject.up();

    expect(subject.name).toBe('Migration20260914074449_payments');
    expect(subject.getQueries()).toEqual([
      'create table "processed_webhook_events" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "event_id" varchar(120) not null, "type" varchar(80) not null, "received_at" timestamptz not null, primary key ("id"));',
      'alter table "processed_webhook_events" add constraint "processed_webhook_events_event_id_unique" unique ("event_id");',
      'alter table "bookings" add "stripe_checkout_session_id" varchar(120) null, add "stripe_payment_intent_id" varchar(120) null, add "paid_at" timestamptz null, add "amount_paid_cents" int null, add "payment_issue" text null;',
      'alter table "bookings" add constraint "bookings_stripe_checkout_session_id_unique" unique ("stripe_checkout_session_id");',
      `alter table "bookings" add constraint "bookings_payment_issue_check" check ("payment_issue" in ('amount_mismatch'));`,
    ]);
  });

  it('is reversible, dropping the constraints before the columns they cover', () => {
    const subject = migration();

    subject.down();

    expect(subject.getQueries()).toEqual([
      'drop table if exists "processed_webhook_events" cascade;',
      'alter table "bookings" drop constraint "bookings_stripe_checkout_session_id_unique";',
      'alter table "bookings" drop constraint "bookings_payment_issue_check";',
      'alter table "bookings" drop column "stripe_checkout_session_id", drop column "stripe_payment_intent_id", drop column "paid_at", drop column "amount_paid_cents", drop column "payment_issue";',
    ]);
  });
});
