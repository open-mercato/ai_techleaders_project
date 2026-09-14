import { describe, expect, it } from 'vitest';
import { LEAD_TIME_REASON, bookableSlot, groupSlotsByDay } from './booking-slots';

const slots = [
  { id: 'morning', startsAt: '2026-09-20T07:30:00.000Z', meetsLeadTime: true },
  { id: 'afternoon', startsAt: '2026-09-20T13:00:00.000Z', meetsLeadTime: true },
  { id: 'next-day', startsAt: '2026-09-21T07:30:00.000Z', meetsLeadTime: true },
];

describe('groupSlotsByDay', () => {
  it('groups times into days in the order they arrive, labelled in the given zone', () => {
    const days = groupSlotsByDay(slots, 'UTC');

    expect(days).toHaveLength(2);
    expect(days[0]).toMatchObject({ date: '2026-09-20', label: 'Sunday 20 September' });
    expect(days[0]?.slots.map((slot) => slot.id)).toEqual(['morning', 'afternoon']);
    expect(days[0]?.slots[0]).toMatchObject({
      id: 'morning',
      start: '2026-09-20T07:30:00.000Z',
      label: '07:30',
    });
    expect(days[1]?.date).toBe('2026-09-21');
  });

  it('re-labels the same instants in the viewer zone, splitting days where that zone does', () => {
    const days = groupSlotsByDay(
      [{ id: 'late', startsAt: '2026-09-20T23:30:00.000Z', meetsLeadTime: true }],
      'Europe/Warsaw',
    );

    // 23:30 UTC is 01:30 the next morning in Warsaw — the day key must follow the zone.
    expect(days[0]).toMatchObject({ date: '2026-09-21', label: 'Monday 21 September' });
    expect(days[0]?.slots[0]?.label).toBe('01:30');
  });

  it('explains a time the server refused instead of hiding it', () => {
    const days = groupSlotsByDay(
      [{ id: 'soon', startsAt: '2026-09-20T07:30:00.000Z', meetsLeadTime: false }],
      'UTC',
    );

    expect(days[0]?.slots[0]?.blockedReason).toBe(LEAD_TIME_REASON);
  });

  it('leaves a bookable time with no reason at all rather than an empty one', () => {
    expect(groupSlotsByDay(slots, 'UTC')[0]?.slots[0]).not.toHaveProperty('blockedReason');
  });

  it('produces no days for a mentor with no published times', () => {
    expect(groupSlotsByDay([], 'UTC')).toEqual([]);
  });
});

describe('bookableSlot', () => {
  it('finds a time the server said may be booked', () => {
    expect(bookableSlot(slots, 'afternoon')?.id).toBe('afternoon');
  });

  it('answers nothing for no choice, an unknown id, or a time inside the lead-time rule', () => {
    expect(bookableSlot(slots, null)).toBeNull();
    expect(bookableSlot(slots, 'gone')).toBeNull();
    expect(
      bookableSlot([{ id: 'soon', startsAt: slots[0]!.startsAt, meetsLeadTime: false }], 'soon'),
    ).toBeNull();
  });
});
