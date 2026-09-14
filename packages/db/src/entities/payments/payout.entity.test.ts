import { describe, expect, it } from 'vitest';
import { entities } from '../index';
import { Payout } from './payout.entity';
import { PAYOUT_HELD_REASONS, PAYOUT_STATUSES } from './payout-status';

const meta = Payout.init().meta;
const properties = meta.properties;

describe('payout statuses', () => {
  it('names where a mentor share got to, and why it is held', () => {
    expect(PAYOUT_STATUSES).toEqual(['held', 'transferred', 'failed']);
    expect(PAYOUT_HELD_REASONS).toEqual(['connect_onboarding_incomplete']);
  });
});

describe('Payout entity', () => {
  it('records what one mentor is owed for one session', () => {
    expect(meta.className).toBe('Payout');
    expect(meta.tableName).toBe('payouts');
    expect(Object.keys(properties).sort()).toEqual([
      'amountCents',
      'booking',
      'createdAt',
      'heldReason',
      'id',
      'mentorProfile',
      'status',
      'stripeTransferId',
      'updatedAt',
    ]);
  });

  it('is registered for ORM discovery', () => {
    expect(entities).toContain(Payout);
  });

  it('allows one payout per session, which is what makes the run repeatable', () => {
    // There is no scheduler: the run is triggered by hand and may be triggered twice. A
    // second row for one session would be a second transfer.
    expect(properties.booking!.unique).toBe(true);
    expect(properties.booking!.deleteRule).toBe('restrict');
    expect(properties.mentorProfile!.deleteRule).toBe('restrict');
  });

  it('starts held, because owed-and-unsent is a row rather than an absence', () => {
    expect(properties.status!.default).toBe('held');
    expect(properties.status!.items).toEqual([...PAYOUT_STATUSES]);
    expect(properties.heldReason!.items).toEqual([...PAYOUT_HELD_REASONS]);
    expect(properties.heldReason!.nullable).toBe(true);
    expect(properties.stripeTransferId!.nullable).toBe(true);
  });

  it('indexes the column the run filters on, and refuses a negative amount', () => {
    expect(meta.indexes).toEqual([{ name: 'payouts_status_index', properties: ['status'] }]);
    expect(meta.checks).toEqual([
      { name: 'payouts_amount_cents_non_negative', expression: '"amount_cents" >= 0' },
    ]);
  });
});
