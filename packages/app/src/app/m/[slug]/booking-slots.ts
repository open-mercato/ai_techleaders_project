export interface BookableSlot {
  id: string;
  startsAt: string;
  /** Computed by the server against its own clock — the browser's is not authoritative. */
  meetsLeadTime: boolean;
}

export interface SlotChoice {
  id: string;
  start: string;
  label: string;
  blockedReason?: string;
}

export interface SlotDay {
  date: string;
  label: string;
  slots: SlotChoice[];
}

export const LEAD_TIME_REASON = 'Starts in less than two hours.';

/**
 * Group published times into the day-by-day shape `AvailabilityPicker` renders.
 *
 * `timeZone` is threaded rather than read here so the caller can render UTC during SSR and
 * hydration and switch to the viewer's zone afterwards — the same two-phase approach
 * `LocalTime` uses, and for the same reason: a label computed from the server's zone and
 * then re-computed from the browser's is a hydration mismatch.
 *
 * The lead-time refusal is presentation of a **server** decision. `meetsLeadTime` arrives
 * on the slot; nothing here re-derives it from the browser's clock, which a mentee can set
 * to whatever they like.
 */
export function groupSlotsByDay(slots: BookableSlot[], timeZone: string): SlotDay[] {
  const dayKey = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const dayLabel = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const timeLabel = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
  });

  const days = new Map<string, SlotDay>();
  for (const slot of slots) {
    const at = new Date(slot.startsAt);
    const date = dayKey.format(at);
    const day = days.get(date) ?? { date, label: dayLabel.format(at), slots: [] };
    day.slots.push({
      id: slot.id,
      start: slot.startsAt,
      label: timeLabel.format(at),
      ...(slot.meetsLeadTime ? {} : { blockedReason: LEAD_TIME_REASON }),
    });
    days.set(date, day);
  }
  return [...days.values()];
}

/** The slot a caller may act on: present, and not refused by the lead-time rule. */
export function bookableSlot(slots: BookableSlot[], slotId: string | null): BookableSlot | null {
  if (slotId === null) return null;
  const found = slots.find((slot) => slot.id === slotId);
  return found !== undefined && found.meetsLeadTime ? found : null;
}
