import { resolve } from 'node:path';
import { afterEach, describe, expect, inject, it } from 'vitest';
import {
  captureBrowserFailure,
  closeAgentBrowser,
  integrationArtifactsDirectory,
  runAgentBrowser,
  signInAs,
  signInCookieHeader,
} from './agent-browser';
import { clickNamed } from './browser-actions';
import {
  CSRF_HEADERS,
  bookAndPay,
  clearBookingData,
  moveSessionToThePast,
  readBooking,
} from './fixtures/booking';
import {
  resetPublishedMentorProfile,
  seedFutureMentorSlot,
  seedOfferReadyMentor,
} from './fixtures/mentor';

/**
 * E03-S05 (#24): cancelling, on both sides of the 24-hour rule.
 */
describe('TC-CANCEL-001 the 24-hour rule', () => {
  const session = `cancellation-${process.pid}`;
  const databaseUrl = inject('integrationDatabaseUrl');

  afterEach(async () => {
    await closeAgentBrowser(session);
    await clearBookingData(databaseUrl);
    await resetPublishedMentorProfile(databaseUrl);
  });

  it('refunds in full outside the window and forfeits the fee inside it', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const mentor = await seedOfferReadyMentor(databaseUrl);
    const far = await seedFutureMentorSlot(
      databaseUrl,
      mentor.profileId,
      new Date(Date.now() + 72 * 60 * 60 * 1000),
    );
    const near = await seedFutureMentorSlot(
      databaseUrl,
      mentor.profileId,
      // Inside the 24-hour window, and comfortably past the two-hour booking rule.
      new Date(Date.now() + 6 * 60 * 60 * 1000),
    );
    const refundable = await bookAndPay(baseUrl, databaseUrl, far.slotId, { eventId: 'evt_far' });
    const forfeited = await bookAndPay(baseUrl, databaseUrl, near.slotId, { eventId: 'evt_near' });

    try {
      await signInAs(session, baseUrl, 'mock-mentee');
      await runAgentBrowser(session, 'open', `${baseUrl}/home`);
      await runAgentBrowser(session, 'wait', '--text', 'Upcoming');

      // The sooner session is first in the list, so this is the one inside the window.
      await clickNamed(session, 'button', /^Cancel session$/);
      await runAgentBrowser(session, 'wait', '--text', 'Cancel this session?');
      const insideWindow = await runAgentBrowser(session, 'snapshot');
      // R09: the outcome is stated *before* the mentee confirms.
      expect(insideWindow).toContain('the fee is not refunded');
      expect(insideWindow).toContain('PLN 0.00');
      await runAgentBrowser(
        session,
        'screenshot',
        resolve(integrationArtifactsDirectory, 'cancellation-inside-window.png'),
        '--full',
      );

      await clickNamed(session, 'button', /^Cancel session$/, 'last');
      await runAgentBrowser(session, 'wait', '--text', 'the fee was not refunded');

      const forfeitedBooking = await readBooking(databaseUrl, forfeited.id);
      expect(forfeitedBooking.status).toBe('cancelled');
      // `none`, not `failed`: the fee is forfeit by decision (D10), not by a refund failing.
      expect(forfeitedBooking.refundStatus).toBe('none');

      // The other one is outside the window, and says so.
      await clickNamed(session, 'button', /^Cancel session$/);
      await runAgentBrowser(session, 'wait', '--text', 'the full amount is refunded');
      await clickNamed(session, 'button', /^Cancel session$/, 'last');
      await runAgentBrowser(session, 'wait', '--text', 'Refunded in full');

      const refundedBooking = await readBooking(databaseUrl, refundable.id);
      expect(refundedBooking.status).toBe('cancelled');
      expect(refundedBooking.refundStatus).toBe('refunded');
      expect(refundedBooking.refundedAmountCents).toBe(mentor.price25Cents);
      expect(refundedBooking.stripeRefundId).toMatch(/^re_mock_/);
    } catch (error) {
      await captureBrowserFailure(session, 'cancellation');
      throw error;
    }
  });

  it('shows the mentor a cancelled session with its refund state', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const mentor = await seedOfferReadyMentor(databaseUrl);
    const slot = await seedFutureMentorSlot(
      databaseUrl,
      mentor.profileId,
      new Date(Date.now() + 72 * 60 * 60 * 1000),
    );
    const booking = await bookAndPay(baseUrl, databaseUrl, slot.slotId, { eventId: 'evt_mentor' });

    await fetch(`${baseUrl}/api/bookings/${booking.id}/cancel`, {
      method: 'POST',
      headers: { ...CSRF_HEADERS, cookie: booking.cookie },
    });

    await signInAs(session, baseUrl, 'mock-mentor');
    await runAgentBrowser(session, 'open', `${baseUrl}/mentor/sessions`);
    await runAgentBrowser(session, 'wait', '--text', 'Refunded in full');
    const mentorView = await runAgentBrowser(session, 'snapshot');

    expect(mentorView).toContain('Cancelled');
    expect(mentorView).toContain('Refunded in full');
    // The mentor is told the time is free again.
    await runAgentBrowser(session, 'open', `${baseUrl}/mentor`);
    await runAgentBrowser(session, 'wait', '--text', 'A session was cancelled');
  });

  it('refuses to cancel a session that has already started, pointing somewhere', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const mentor = await seedOfferReadyMentor(databaseUrl);
    const booking = await bookAndPay(baseUrl, databaseUrl, mentor.slotId, {
      eventId: 'evt_started',
    });
    await moveSessionToThePast(databaseUrl, booking.id);

    const refused = await fetch(`${baseUrl}/api/bookings/${booking.id}/cancel`, {
      method: 'POST',
      headers: { ...CSRF_HEADERS, cookie: booking.cookie },
    });
    const body = (await refused.json()) as { error: { message: string } };

    expect(refused.status).toBe(409);
    // A bare refusal would read as "your money is gone, goodbye".
    expect(body.error.message).toContain('quality dispute');
    expect((await readBooking(databaseUrl, booking.id)).status).toBe('confirmed');
  });

  it('refuses to cancel somebody else session', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const mentor = await seedOfferReadyMentor(databaseUrl);
    const booking = await bookAndPay(baseUrl, databaseUrl, mentor.slotId, { eventId: 'evt_other' });
    // The operator persona is a mentee too, so this is a real caller with the right role
    // and the wrong booking — not a role refusal in disguise.
    const stranger = await signInCookieHeader(baseUrl, 'mock-operator');

    const refused = await fetch(`${baseUrl}/api/bookings/${booking.id}/cancel`, {
      method: 'POST',
      headers: { ...CSRF_HEADERS, cookie: stranger },
    });

    expect(refused.status).toBe(403);
    expect((await readBooking(databaseUrl, booking.id)).status).toBe('confirmed');
  });
});
