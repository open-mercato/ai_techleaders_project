'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AvailabilityPicker,
  BookingSummary,
  Button,
  DurationSelector,
  PaymentStatus,
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
  /**
   * How to leave for the hosted payment. Injected because the destination is outside this
   * app, so `next/navigation` is the wrong tool and a full-page assignment is the right
   * one — and because a test cannot let jsdom navigate.
   */
  navigate?: (url: string) => void;
}

interface HeldBooking {
  id: string;
}

/**
 * What the mentee is told while the payment is being arranged.
 *
 * `null` means nothing has been attempted. The rest map onto `PaymentStatus`, whose copy is
 * already the product's: in particular `slot-taken` and `expired` are different failures
 * with different recoveries, so they are not flattened into one "something went wrong".
 */
type Progress = null | 'redirecting' | 'slot-taken' | 'expired' | 'failed';

/**
 * Leave this app for the hosted payment.
 *
 * A full-page assignment rather than `next/navigation`: the destination is the payment
 * provider, not a route in this app, and the router would try to resolve it as one. Named
 * and exported so the panel's default is a thing a test can exercise rather than a closure
 * only a real browser ever runs.
 */
export function leaveForCheckout(url: string): void {
  window.location.assign(url);
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
  navigate = leaveForCheckout,
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
  const [progress, setProgress] = useState<Progress>(null);
  const [held, setHeld] = useState<HeldBooking | null>(null);

  useEffect(() => {
    const viewerZone = new Intl.DateTimeFormat().resolvedOptions().timeZone;
    // Deferred rather than set synchronously in the effect body, which React's lint rule
    // rejects as a cascading render. `LocalTime` defers the same switch the same way.
    queueMicrotask(() => setTimeZone(viewerZone));
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
  const chosenPriceCents = prices.price25Cents;

  // Both arguments are passed in rather than read from the closure so the action cannot be
  // reached without them: the only call site is inside the branch that narrowed them.
  async function reserve(slot: BookableSlot, lengthMinutes: 25 | 50) {
    if (!signedInAsMentee) {
      router.push(`/sign-in?returnTo=${encodeURIComponent(bookingReturnTo(mentorSlug, slot.id))}`);
      return;
    }
    setSubmitting(true);
    setFailure(null);
    setProgress(null);

    const reserved = await apiCall<HeldBooking>('/api/bookings', {
      body: { slotId: slot.id, lengthMinutes },
    });
    if (!reserved.ok) {
      setSubmitting(false);
      setFailure(reserved.error.message);
      // A conflict on the reservation itself means somebody else took the time.
      setProgress(reserved.error.code === 'conflict' ? 'slot-taken' : 'failed');
      return;
    }

    setHeld(reserved.data);
    setProgress('redirecting');
    const checkout = await apiCall<{ url: string }>(
      `/api/bookings/${encodeURIComponent(reserved.data.id)}/checkout`,
      { method: 'POST' },
    );
    if (!checkout.ok) {
      setSubmitting(false);
      setFailure(checkout.error.message);
      // A conflict on the checkout means the hold lapsed between the two calls.
      setProgress(checkout.error.code === 'conflict' ? 'expired' : 'failed');
      return;
    }

    // Deliberately no `setSubmitting(false)`: the page is leaving, and re-enabling the
    // action would invite a second reservation on the way out.
    navigate(checkout.data.url);
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

    {progress === null ? null : <PaymentStatus state={progress} />}
    <SessionIsTextNotice />
    {failure === null ? null : <ErrorMessage message={failure} />}
  </section>;
}
