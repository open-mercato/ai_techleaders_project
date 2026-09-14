import { createHmac } from 'node:crypto';
import { resolve } from 'node:path';
import { Booking, MikroORM, Slot, entities } from '@devmentor/db';
import { afterAll, describe, expect, inject, it } from 'vitest';
import {
  captureBrowserFailure,
  closeAgentBrowser,
  integrationArtifactsDirectory,
  runAgentBrowser,
  signInAs,
  signInCookieHeader,
} from './agent-browser';
import {
  resetPublishedMentorProfile,
  seedFutureMentorSlot,
  seedOfferReadyMentor,
} from './fixtures/mentor';

/**
 * TEMPORARY — checkpoint 6 evidence for `om-auto-create-pr-loop` run
 * `2026-09-14-epic-03-booking-and-payment`. The permanent scenario lands at Step 7.5.
 */

const MOCK_WEBHOOK_SECRET = 'mock-webhook-secret';
const CSRF_HEADERS = { 'content-type': 'application/json', 'x-devmentor-request': '1' };

async function clickNamed(session: string, role: string, name: RegExp): Promise<void> {
  const payload = JSON.parse(await runAgentBrowser(session, 'snapshot', '-i', '--json')) as {
    data: { refs: Record<string, { role: string; name: string }> };
  };
  const matches = Object.entries(payload.data.refs).filter(
    ([, ref]) => ref.role === role && name.test(ref.name),
  );
  const entry = matches.at(-1);
  if (entry === undefined) {
    throw new Error(
      `No ${role} named ${String(name)} in the tree. Present: `
      + Object.values(payload.data.refs).map((ref) => `${ref.role} "${ref.name}"`).join(', '),
    );
  }
  await runAgentBrowser(session, 'click', `@${entry[0]}`);
}

/** Reserve and pay for one slot, entirely through the API, and return the booking id. */
async function bookAndPay(baseUrl: string, databaseUrl: string, slotId: string): Promise<string> {
  const cookie = await signInCookieHeader(baseUrl, 'mock-mentee');
  const reserved = await fetch(`${baseUrl}/api/bookings`, {
    method: 'POST',
    headers: { ...CSRF_HEADERS, cookie },
    body: JSON.stringify({ slotId, lengthMinutes: 25 }),
  });
  const { data: booking } = (await reserved.json()) as { data: { id: string } };

  await fetch(`${baseUrl}/api/bookings/${booking.id}/checkout`, {
    method: 'POST',
    headers: { ...CSRF_HEADERS, cookie },
  });

  const orm = await MikroORM.init({ clientUrl: databaseUrl, entities });
  await orm.connect();
  let checkoutSessionId: string;
  let priceCents: number;
  try {
    const stored = await orm.em.fork().findOneOrFail(Booking, { id: booking.id });
    checkoutSessionId = stored.stripeCheckoutSessionId!;
    priceCents = stored.priceCents;
  } finally {
    await orm.close(true);
  }

  const rawBody = JSON.stringify({
    id: `evt_cancel_${booking.id}`,
    type: 'checkout.session.completed',
    checkoutSessionId,
    paymentIntentId: `pi_${booking.id}`,
    amountTotalCents: priceCents,
    currency: 'PLN',
  });
  const confirmed = await fetch(`${baseUrl}/api/payments/webhook`, {
    method: 'POST',
    headers: {
      'stripe-signature': createHmac('sha256', MOCK_WEBHOOK_SECRET).update(rawBody).digest('hex'),
    },
    body: rawBody,
  });
  if ((await confirmed.text()) !== 'confirmed') throw new Error('the booking was not confirmed');
  return booking.id;
}

async function readBooking(databaseUrl: string, bookingId: string) {
  const orm = await MikroORM.init({ clientUrl: databaseUrl, entities });
  await orm.connect();
  try {
    return await orm.em.fork().findOneOrFail(Booking, { id: bookingId });
  } finally {
    await orm.close(true);
  }
}

/** Free every slot this scenario made, so the fixture reset is not the thing that fails. */
async function clearBookings(databaseUrl: string) {
  const orm = await MikroORM.init({ clientUrl: databaseUrl, entities });
  await orm.connect();
  try {
    const em = orm.em.fork();
    await em.nativeDelete(Booking, {});
    await em.nativeDelete(Slot, {});
  } finally {
    await orm.close(true);
  }
}

describe('checkpoint 6 — cancelling on both sides of the window', () => {
  const session = `checkpoint-cancel-${process.pid}`;
  const databaseUrl = inject('integrationDatabaseUrl');

  afterAll(async () => {
    await closeAgentBrowser(session);
    await clearBookings(databaseUrl);
    await resetPublishedMentorProfile(databaseUrl);
  });

  it('refunds in full outside 24 hours and forfeits the fee inside it', async () => {
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
      // Inside the 24-hour window, but comfortably past the two-hour booking rule.
      new Date(Date.now() + 6 * 60 * 60 * 1000),
    );

    const refundable = await bookAndPay(baseUrl, databaseUrl, far.slotId);
    const forfeited = await bookAndPay(baseUrl, databaseUrl, near.slotId);

    try {
      await runAgentBrowser(session, 'connect', process.env.AGENT_BROWSER_CDP ?? '9222');
      await signInAs(session, baseUrl, 'mock-mentee');
      await runAgentBrowser(session, 'open', `${baseUrl}/home`);
      await runAgentBrowser(session, 'wait', '--text', 'Upcoming');

      // The session inside the window is the sooner one, so it is first in the list.
      await clickNamed(session, 'button', /^Cancel session$/);
      await runAgentBrowser(session, 'wait', '--text', 'Cancel this session?');
      const dialog = await runAgentBrowser(session, 'snapshot');
      expect(dialog).toContain('the full amount is refunded');
      expect(dialog).toContain('PLN 90.00');
      await runAgentBrowser(
        session,
        'screenshot',
        resolve(integrationArtifactsDirectory, 'checkpoint-6-cancel-refundable.png'),
        '--full',
      );

      await clickNamed(session, 'button', /^Cancel session$/);
      await runAgentBrowser(session, 'wait', '--text', 'Refunded in full');
      const afterRefund = await runAgentBrowser(session, 'snapshot');
      expect(afterRefund).toContain('Refunded in full');
      await runAgentBrowser(
        session,
        'screenshot',
        resolve(integrationArtifactsDirectory, 'checkpoint-6-cancel-refunded.png'),
        '--full',
      );

      const refunded = await readBooking(databaseUrl, refundable);
      expect(refunded.status).toBe('cancelled');
      expect(refunded.refundStatus).toBe('refunded');
      expect(refunded.refundedAmountCents).toBe(mentor.price25Cents);

      // Now the one inside the window: same action, opposite outcome, said up front.
      await clickNamed(session, 'button', /^Cancel session$/);
      await runAgentBrowser(session, 'wait', '--text', 'the fee is not refunded');
      const lateDialog = await runAgentBrowser(session, 'snapshot');
      expect(lateDialog).toContain('the fee is not refunded');
      expect(lateDialog).toContain('PLN 0.00');
      await runAgentBrowser(
        session,
        'screenshot',
        resolve(integrationArtifactsDirectory, 'checkpoint-6-cancel-forfeited.png'),
        '--full',
      );

      await clickNamed(session, 'button', /^Cancel session$/);
      await runAgentBrowser(session, 'wait', '--text', 'the fee was not refunded');

      const forfeitedBooking = await readBooking(databaseUrl, forfeited);
      expect(forfeitedBooking.status).toBe('cancelled');
      // `none`, not `failed`: the fee is forfeit by decision (D10), not by a refund failing.
      expect(forfeitedBooking.refundStatus).toBe('none');
    } catch (error) {
      await captureBrowserFailure(session, 'checkpoint-6-cancel');
      throw error;
    }
  });
});
