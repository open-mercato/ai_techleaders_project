import type { Configuration } from '@mikro-orm/core';
import type { AbstractSqlDriver } from '@mikro-orm/postgresql';
import { describe, expect, it } from 'vitest';
import { Migration20260914085102_payout_held_notification } from '../../migrations/Migration20260914085102_payout_held_notification';

function migration(): Migration20260914085102_payout_held_notification {
  return new Migration20260914085102_payout_held_notification(
    undefined as unknown as AbstractSqlDriver,
    undefined as unknown as Configuration,
  );
}

describe('payout held notification migration', () => {
  it('widens the notification kinds by one value', () => {
    const subject = migration();

    subject.up();

    expect(subject.getQueries()).toEqual([
      'alter table "notifications" drop constraint "notifications_kind_check";',
      `alter table "notifications" add constraint "notifications_kind_check" check ("kind" in ('booking_confirmed', 'booking_cancelled', 'payout_held'));`,
    ]);
  });

  it('narrows back cleanly, because it ships before anything writes the new value', () => {
    const subject = migration();

    subject.down();

    expect(subject.getQueries()).toEqual([
      'alter table "notifications" drop constraint "notifications_kind_check";',
      `alter table "notifications" add constraint "notifications_kind_check" check ("kind" in ('booking_confirmed', 'booking_cancelled'));`,
    ]);
  });
});
