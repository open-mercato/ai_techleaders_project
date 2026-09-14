import type { Configuration } from '@mikro-orm/core';
import type { AbstractSqlDriver } from '@mikro-orm/postgresql';
import { describe, expect, it } from 'vitest';
import { Migration20260914082606_booking_cancellation } from '../../migrations/Migration20260914082606_booking_cancellation';

function migration(): Migration20260914082606_booking_cancellation {
  return new Migration20260914082606_booking_cancellation(
    undefined as unknown as AbstractSqlDriver,
    undefined as unknown as Configuration,
  );
}

describe('booking cancellation migration', () => {
  it('adds the cancellation columns with no refund as the default state', () => {
    const subject = migration();

    subject.up();

    expect(subject.name).toBe('Migration20260914082606_booking_cancellation');
    expect(subject.getQueries()).toEqual([
      `alter table "bookings" add "cancelled_at" timestamptz null, add "refund_status" text not null default 'none', add "stripe_refund_id" varchar(120) null, add "refunded_amount_cents" int null;`,
      `alter table "bookings" add constraint "bookings_refund_status_check" check ("refund_status" in ('none', 'pending', 'refunded', 'failed'));`,
    ]);
  });

  it('is reversible, dropping the constraint before the column it covers', () => {
    const subject = migration();

    subject.down();

    expect(subject.getQueries()).toEqual([
      'alter table "bookings" drop constraint "bookings_refund_status_check";',
      'alter table "bookings" drop column "cancelled_at", drop column "refund_status", drop column "stripe_refund_id", drop column "refunded_amount_cents";',
    ]);
  });
});
