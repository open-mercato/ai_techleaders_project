import { Migration } from '@mikro-orm/migrations';

/**
 * Let a notification be about a held payout (R05).
 *
 * Widening a membership `CHECK` is additive and safe in both directions here: no existing
 * row carries the new value, so the `down` narrows back cleanly. The reverse — adding a
 * value that rows already use, then narrowing — is the breaking shape `SDLC.md` names, and
 * is why this migration ships *before* anything writes one.
 */
export class Migration20260914085102_payout_held_notification extends Migration {
  override name = 'Migration20260914085102_payout_held_notification';

  override up(): void | Promise<void> {
    this.addSql(`alter table "notifications" drop constraint "notifications_kind_check";`);
    this.addSql(`alter table "notifications" add constraint "notifications_kind_check" check ("kind" in ('booking_confirmed', 'booking_cancelled', 'payout_held'));`);
  }

  override down(): void | Promise<void> {
    this.addSql(`alter table "notifications" drop constraint "notifications_kind_check";`);
    this.addSql(`alter table "notifications" add constraint "notifications_kind_check" check ("kind" in ('booking_confirmed', 'booking_cancelled'));`);
  }
}
