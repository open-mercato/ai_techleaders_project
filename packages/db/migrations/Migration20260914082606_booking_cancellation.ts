import { Migration } from '@mikro-orm/migrations';

/**
 * Record a cancellation and where its money got to (D10, R09).
 *
 * `refund_status` defaults to `none` because that is both the state of every booking that
 * was never cancelled *and* the deliberate outcome of a cancellation inside the 24-hour
 * window — the fee is forfeit, so no refund is a decision rather than a failure. `failed`
 * is the value that needs a person.
 */
export class Migration20260914082606_booking_cancellation extends Migration {
  override name = 'Migration20260914082606_booking_cancellation';

  override up(): void | Promise<void> {
    this.addSql(`alter table "bookings" add "cancelled_at" timestamptz null, add "refund_status" text not null default 'none', add "stripe_refund_id" varchar(120) null, add "refunded_amount_cents" int null;`);
    this.addSql(`alter table "bookings" add constraint "bookings_refund_status_check" check ("refund_status" in ('none', 'pending', 'refunded', 'failed'));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "bookings" drop constraint "bookings_refund_status_check";`);
    this.addSql(`alter table "bookings" drop column "cancelled_at", drop column "refund_status", drop column "stripe_refund_id", drop column "refunded_amount_cents";`);
  }
}
