import { Migration } from '@mikro-orm/migrations';

/**
 * Record what a payment provider told us, and what this process already acted on.
 *
 * `processed_webhook_events.event_id` is unique because that uniqueness *is* the
 * exactly-once guarantee: the confirmation handler inserts the row inside the same
 * transaction as the confirmation, so a redelivery loses the insert and rolls the whole
 * thing back. `bookings.stripe_checkout_session_id` is unique for the mirror reason — two
 * bookings must never be able to claim one payment.
 */
export class Migration20260914074449_payments extends Migration {
  override name = 'Migration20260914074449_payments';

  override up(): void | Promise<void> {
    this.addSql(`create table "processed_webhook_events" ("id" uuid not null, "created_at" timestamptz not null, "updated_at" timestamptz not null, "event_id" varchar(120) not null, "type" varchar(80) not null, "received_at" timestamptz not null, primary key ("id"));`);
    this.addSql(`alter table "processed_webhook_events" add constraint "processed_webhook_events_event_id_unique" unique ("event_id");`);

    this.addSql(`alter table "bookings" add "stripe_checkout_session_id" varchar(120) null, add "stripe_payment_intent_id" varchar(120) null, add "paid_at" timestamptz null, add "amount_paid_cents" int null, add "payment_issue" text null;`);
    this.addSql(`alter table "bookings" add constraint "bookings_stripe_checkout_session_id_unique" unique ("stripe_checkout_session_id");`);
    this.addSql(`alter table "bookings" add constraint "bookings_payment_issue_check" check ("payment_issue" in ('amount_mismatch'));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`drop table if exists "processed_webhook_events" cascade;`);

    this.addSql(`alter table "bookings" drop constraint "bookings_stripe_checkout_session_id_unique";`);
    this.addSql(`alter table "bookings" drop constraint "bookings_payment_issue_check";`);
    this.addSql(`alter table "bookings" drop column "stripe_checkout_session_id", drop column "stripe_payment_intent_id", drop column "paid_at", drop column "amount_paid_cents", drop column "payment_issue";`);
  }
}
