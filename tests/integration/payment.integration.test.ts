import { afterEach, describe, expect, inject, it } from 'vitest';
import {
  bookAndPay,
  clearBookingData,
  deliverWebhook,
  readBooking,
  reserveAndOpenCheckout,
} from './fixtures/booking';
import { resetPublishedMentorProfile, seedOfferReadyMentor } from './fixtures/mentor';

/**
 * E03-S03 (#22) and E03-S03-T01 (#34): the money gate.
 *
 * `SDLC.md` asks a money story for the failure, retry and idempotency paths. These run
 * against the app as a running process with a real database — a forged delivery is refused
 * by the same route Stripe would call, and a redelivery loses the same unique index.
 */
describe('TC-PAYMENT-001 confirmation is exactly once', () => {
  const databaseUrl = inject('integrationDatabaseUrl');

  afterEach(async () => {
    await clearBookingData(databaseUrl);
    await resetPublishedMentorProfile(databaseUrl);
  });

  it('confirms from a verified delivery and records booking-to-start', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const mentor = await seedOfferReadyMentor(databaseUrl);

    const booking = await bookAndPay(baseUrl, databaseUrl, mentor.slotId);
    const confirmed = await readBooking(databaseUrl, booking.id);

    expect(confirmed.status).toBe('confirmed');
    expect(confirmed.amountPaidCents).toBe(mentor.price25Cents);
    expect(confirmed.paymentIssue).toBeNull();
    // The hold is over: the slot is held by a confirmed booking now, not by a timer.
    expect(confirmed.expiresAt).toBeNull();
    // R15/D22: booking-to-start reads off this row alone.
    expect(confirmed.bookedAt).not.toBeNull();
    expect(confirmed.startsAt.getTime() - confirmed.bookedAt!.getTime()).toBeGreaterThan(0);
    // R10: the fee in force at confirmation, snapshotted.
    expect(confirmed.feePercentApplied).toBe(20);
    expect(confirmed.platformFeeCents! + confirmed.mentorShareCents!)
      .toBe(confirmed.priceCents);
  });

  it('answers a redelivery of the same event with one booking and one charge', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const mentor = await seedOfferReadyMentor(databaseUrl);
    const booking = await bookAndPay(baseUrl, databaseUrl, mentor.slotId, {
      eventId: 'evt_redelivery',
    });
    const first = await readBooking(databaseUrl, booking.id);

    const again = await deliverWebhook(baseUrl, {
      id: 'evt_redelivery',
      type: 'checkout.session.completed',
      checkoutSessionId: booking.checkoutSessionId,
      paymentIntentId: `pi_${booking.id}`,
      amountTotalCents: booking.priceCents,
      currency: 'PLN',
    });

    expect(again).toEqual({ status: 200, outcome: 'duplicate' });
    const after = await readBooking(databaseUrl, booking.id);
    expect(after.bookedAt!.getTime()).toBe(first.bookedAt!.getTime());
    expect(after.amountPaidCents).toBe(first.amountPaidCents);
  });

  it('refuses a forged delivery with 400 and changes nothing', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const mentor = await seedOfferReadyMentor(databaseUrl);
    const booking = await reserveAndOpenCheckout(baseUrl, databaseUrl, mentor.slotId);

    const forged = await deliverWebhook(
      baseUrl,
      {
        id: 'evt_forged',
        type: 'checkout.session.completed',
        checkoutSessionId: booking.checkoutSessionId,
        paymentIntentId: 'pi_forged',
        amountTotalCents: booking.priceCents,
        currency: 'PLN',
      },
      'not-a-signature',
    );

    // 400, not 5xx: a body that does not verify is not evidence of anything, and a 5xx
    // would invite the provider to resend a forgery forever.
    expect(forged.status).toBe(400);
    expect((await readBooking(databaseUrl, booking.id)).status).toBe('pending');
  });

  it('refuses an amount that is not the mentor price, and flags it (R08)', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const mentor = await seedOfferReadyMentor(databaseUrl);
    const booking = await reserveAndOpenCheckout(baseUrl, databaseUrl, mentor.slotId);

    const mismatch = await deliverWebhook(baseUrl, {
      id: 'evt_mismatch',
      type: 'checkout.session.completed',
      checkoutSessionId: booking.checkoutSessionId,
      paymentIntentId: `pi_${booking.id}`,
      amountTotalCents: 1,
      currency: 'PLN',
    });

    expect(mismatch.outcome).toBe('amount_mismatch');
    const flagged = await readBooking(databaseUrl, booking.id);
    // Money that arrived at the wrong amount has to be reconciled by a person either way;
    // confirming it quietly would hide that it must be.
    expect(flagged.status).toBe('pending');
    expect(flagged.paymentIssue).toBe('amount_mismatch');
    expect(flagged.amountPaidCents).toBe(1);
  });

  it('leaves the slot free when a mentee abandons the checkout', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const mentor = await seedOfferReadyMentor(databaseUrl);
    const abandoned = await reserveAndOpenCheckout(baseUrl, databaseUrl, mentor.slotId);

    // Nothing confirms it, so the hold is all that exists — and the hold is not a session.
    const held = await readBooking(databaseUrl, abandoned.id);
    expect(held.status).toBe('pending');
    expect(held.bookedAt).toBeNull();

    // The list a mentee sees shows the hold as waiting for payment, not as a session.
    const sessions = await fetch(`${baseUrl}/api/bookings?as=mentee`, {
      headers: { cookie: abandoned.cookie },
    });
    const { data } = (await sessions.json()) as { data: { status: string }[] };
    expect(data.map((item) => item.status)).toEqual(['pending']);
  });

  it('acknowledges an event type the product does not act on', async () => {
    const baseUrl = inject('integrationBaseUrl');

    const ignored = await deliverWebhook(baseUrl, {
      id: `evt_other_${process.pid}`,
      type: 'unhandled',
      rawType: 'invoice.paid',
    });

    // Acknowledged, not dropped: "we received it and ignored it" and "we never received it"
    // must be tellable apart when a payment is reconciled by hand.
    expect(ignored).toEqual({ status: 200, outcome: 'ignored' });
  });
});
