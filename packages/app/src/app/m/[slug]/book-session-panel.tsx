'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AvailabilityPicker,
  BookingSummary,
  Button,
  DurationSelector,
  SessionIsTextNotice,
  priceLabel,
} from '@devmentor/ui';
import { apiCall, ErrorMessage } from '@devmentor/ui/backend';
import { bookableSlot, groupSlotsByDay, type BookableSlot } from './booking-slots';

export interface MentorPrices {
  price25Cents: number;
  price50Cents: number;
  currency: string;
}

export interface BookSessionPanelProps {
  mentorSlug: string;
  mentorName: string;
  slots: BookableSlot[];
  prices: MentorPrices | null;
  signedInAsMentee: boolean;
  /** From `?slot=`, so returning from sign-in lands on the time the mentee chose. */
  initialSlotId?: string | null;
}

interface HeldBooking {
  id: string;
  expiresAt: string | null;
}

/** Where sign-in should send a signed-out visitor back to, carrying their chosen time. */
export function bookingReturnTo(mentorSlug: string, slotId: string | null): string {
  const path = `/m/${mentorSlug}`;
  return slotId === null ? path : `${path}?slot=${encodeURIComponent(slotId)}`;
}

/**
 * The mentee's half of the mentor page (#21): choose a time, choose a length, see the
 * mentor's price for it, and reserve.
 *
 * Two rules are visible here rather than only enforced server-side, because a mentee who
 * cannot see why a time is unavailable will try it again: a slot inside the two-hour window
 * is rendered disabled **with its reason**, and the price shown is the mentor's own price
 * for the chosen length, read from the page's own data rather than computed here.
 *
 * A signed-out visitor is not shown a dead end either. Choosing a time and pressing the
 * action sends them to sign-in with a `returnTo` that names the same slot, so they come
 * back to the choice they made.
 */
export function BookSessionPanel({
  mentorSlug,
  mentorName,
  slots,
  prices,
  signedInAsMentee,
  initialSlotId = null,
}: BookSessionPanelProps) {
  const router = useRouter();
  // UTC first, then the viewer's zone after mount — the same two-phase approach `LocalTime`
  // uses, so the server-rendered labels and the hydrated ones agree.
  const [timeZone, setTimeZone] = useState('UTC');
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(
    bookableSlot(slots, initialSlotId)?.id ?? null,
  );
  const [minutes, setMinutes] = useState<25 | 50 | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [held, setHeld] = useState<HeldBooking | null>(null);

  useEffect(() => {
    setTimeZone(new Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

  const days = useMemo(() => groupSlotsByDay(slots, timeZone), [slots, timeZone]);
  const selected = bookableSlot(slots, selectedSlotId);

  if (prices === null) {
    return <section className="dm-product-stack">
      <p className="dm-product-callout" role="status">
        {mentorName} is not taking bookings at the moment.
      </p>
    </section>;
  }

  const durations = [
    { minutes: 25 as const, price: priceLabel(prices.price25Cents, prices.currency) },
    { minutes: 50 as const, price: priceLabel(prices.price50Cents, prices.currency) },
  ];
  const chosenPriceCents = minutes === 25 ? prices.price25Cents : prices.price50Cents;

  // Both arguments are passed in rather than read from the closure so the action cannot be
  // reached without them: the only call site is inside the branch that narrowed them.
  async function reserve(slot: BookableSlot, lengthMinutes: 25 | 50) {
    if (!signedInAsMentee) {
      router.push(`/sign-in?returnTo=${encodeURIComponent(bookingReturnTo(mentorSlug, slot.id))}`);
      return;
    }
    setSubmitting(true);
    setFailure(null);
    const result = await apiCall<HeldBooking>('/api/bookings', {
      body: { slotId: slot.id, lengthMinutes },
    });
    setSubmitting(false);
    if (result.ok) setHeld(result.data);
    else setFailure(result.error.message);
  }

  return <section className="dm-product-stack" aria-labelledby="book-session-heading">
    <h2 id="book-session-heading" className="dm-product-heading">Book a session</h2>

    <AvailabilityPicker
      days={days}
      timeZone={timeZone}
      selectedSlotId={selectedSlotId}
      onSlotChange={setSelectedSlotId}
      disabled={submitting || held !== null}
    />

    <DurationSelector
      options={durations}
      selected={minutes}
      onChange={setMinutes}
      disabled={submitting || held !== null}
    />

    {selected !== null && minutes !== null ? <BookingSummary
      mentorName={mentorName}
      startsAt={selected.startsAt}
      dateLabel={new Intl.DateTimeFormat('en-GB', {
        timeZone,
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }).format(new Date(selected.startsAt))}
      timeLabel={new Intl.DateTimeFormat('en-GB', {
        timeZone,
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(selected.startsAt))}
      timeZone={timeZone}
      duration={minutes}
      total={priceLabel(chosenPriceCents, prices.currency)}
      notice={held === null ? undefined : 'This time is held for you while you pay.'}
      actions={held === null
        ? <Button type="button" disabled={submitting} aria-busy={submitting} onClick={() => void reserve(selected, minutes)}>
            {submitting
              ? 'Holding this time…'
              : signedInAsMentee ? 'Continue to payment' : 'Sign in to book'}
          </Button>
        : undefined}
    /> : null}

    <SessionIsTextNotice />
    {failure === null ? null : <ErrorMessage message={failure} />}
  </section>;
}
