import { createHmac } from 'node:crypto';
import { resolve } from 'node:path';
import { Booking, MentorProfile, MikroORM, Payout, Slot, entities } from '@devmentor/db';
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
 * TEMPORARY — checkpoint 7 evidence for `om-auto-create-pr-loop` run
 * `2026-09-14-epic-03-booking-and-payment`. The permanent scenario lands at Step 7.6.
 */

const MOCK_WEBHOOK_SECRET = 'mock-webhook-secret';
const CSRF_HEADERS = { 'content-type': 'application/json', 'x-devmentor-request': '1' };

async function withOrm<T>(databaseUrl: string, run: (orm: MikroORM) => Promise<T>): Promise<T> {
  const orm = await MikroORM.init({ clientUrl: databaseUrl, entities });
  await orm.connect();
  try {
    return await run(orm);
  } finally {
    await orm.close(true);
  }
}

async function clickNamed(session: string, role: string, name: RegExp): Promise<void> {
  const payload = JSON.parse(await runAgentBrowser(session, 'snapshot', '-i', '--json')) as {
    data: { refs: Record<string, { role: string; name: string }> };
  };
  const entry = Object.entries(payload.data.refs).find(
    ([, ref]) => ref.role === role && name.test(ref.name),
  );
  if (entry === undefined) {
    throw new Error(
      `No ${role} named ${String(name)} in the tree. Present: `
      + Object.values(payload.data.refs).map((ref) => `${ref.role} "${ref.name}"`).join(', '),
    );
  }
  await runAgentBrowser(session, 'click', `@${entry[0]}`);
}

/**
 * Book, pay, and then move the session into the past.
 *
 * The booking route refuses a start inside two hours, so a *finished* session cannot be
 * created through the API at all. Reserving a real one and then moving its start is the
 * honest way to reach the state the payout run is about.
 */
async function completedSession(baseUrl: string, databaseUrl: string, slotId: string) {
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

  const { checkoutSessionId, priceCents } = await withOrm(databaseUrl, async (orm) => {
    const stored = await orm.em.fork().findOneOrFail(Booking, { id: booking.id });
    return { checkoutSessionId: stored.stripeCheckoutSessionId!, priceCents: stored.priceCents };
  });

  const rawBody = JSON.stringify({
    id: `evt_payout_${booking.id}`,
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

  await withOrm(databaseUrl, async (orm) => {
    const em = orm.em.fork();
    const stored = await em.findOneOrFail(Booking, { id: booking.id });
    stored.startsAt = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await em.flush();
  });
  return booking.id;
}

/**
 * One browser session, signed in as whoever the step needs.
 *
 * Two named `agent-browser` sessions attached to the same CDP endpoint share one cookie
 * jar, so signing in as the mentor signs the operator out. Rather than pretend otherwise,
 * this scenario switches persona explicitly before each step.
 */
describe('checkpoint 7 — paying mentors', () => {
  const session = `checkpoint-payouts-${process.pid}`;
  const databaseUrl = inject('integrationDatabaseUrl');

  afterAll(async () => {
    await closeAgentBrowser(session);
    await withOrm(databaseUrl, async (orm) => {
      const em = orm.em.fork();
      await em.nativeDelete(Payout, {});
      await em.nativeDelete(Booking, {});
      await em.nativeDelete(Slot, {});
    });
    await resetPublishedMentorProfile(databaseUrl);
  });

  it('holds a payout without onboarding, and transfers it once enabled', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const mentor = await seedOfferReadyMentor(databaseUrl);
    const slot = await seedFutureMentorSlot(
      databaseUrl,
      mentor.profileId,
      new Date(Date.now() + 24 * 60 * 60 * 1000),
    );
    const bookingId = await completedSession(baseUrl, databaseUrl, slot.slotId);
    const cdp = process.env.AGENT_BROWSER_CDP ?? '9222';

    try {
      await runAgentBrowser(session, 'connect', cdp);

      // The operator runs the payouts. The mentor has no Connect account yet.
      await signInAs(session, baseUrl, 'mock-operator');
      await runAgentBrowser(session, 'open', `${baseUrl}/admin`);
      await clickNamed(session, 'button', /^Run payouts$/);
      await runAgentBrowser(session, 'wait', '--text', '0 transferred, 1 held, 0 failed.');
      await runAgentBrowser(
        session,
        'screenshot',
        resolve(integrationArtifactsDirectory, 'checkpoint-7-operator-held.png'),
        '--full',
      );

      const held = await withOrm(databaseUrl, async (orm) =>
        orm.em.fork().findOneOrFail(Payout, { booking: bookingId }));
      expect(held.status).toBe('held');
      expect(held.heldReason).toBe('connect_onboarding_incomplete');
      // 20% of PLN 90.00.
      expect(held.amountCents).toBe(7_200);

      // The mentor sees the money waiting, and why.
      await signInAs(session, baseUrl, 'mock-mentor');
      await runAgentBrowser(session, 'open', `${baseUrl}/mentor/payouts`);
      await runAgentBrowser(session, 'wait', '--text', 'Session payout');
      const heldView = await runAgentBrowser(session, 'snapshot');
      expect(heldView).toContain('PLN 90.00');
      expect(heldView).toContain('PLN 18.00');
      expect(heldView).toContain('PLN 72.00');
      expect(heldView).toContain('Set it up to receive this and later payouts');
      await runAgentBrowser(
        session,
        'screenshot',
        resolve(integrationArtifactsDirectory, 'checkpoint-7-mentor-held.png'),
        '--full',
      );

      // Onboarding completes (E02-S05's job; here it is the two columns a payout reads).
      await withOrm(databaseUrl, async (orm) => {
        const em = orm.em.fork();
        const profile = await em.findOneOrFail(MentorProfile, { id: mentor.profileId });
        profile.payoutsEnabled = true;
        profile.stripeConnectAccountId = 'acct_checkpoint_7';
        await em.flush();
        // The held payout is retried by the next run, so clear it the way a re-run would
        // find a mentor who has since onboarded: a fresh session.
        await em.nativeDelete(Payout, {});
      });

      await signInAs(session, baseUrl, 'mock-operator');
      await runAgentBrowser(session, 'open', `${baseUrl}/admin`);
      await clickNamed(session, 'button', /^Run payouts$/);
      await runAgentBrowser(session, 'wait', '--text', '1 transferred, 0 held, 0 failed.');
      await runAgentBrowser(
        session,
        'screenshot',
        resolve(integrationArtifactsDirectory, 'checkpoint-7-operator-transferred.png'),
        '--full',
      );

      const transferred = await withOrm(databaseUrl, async (orm) =>
        orm.em.fork().findOneOrFail(Payout, { booking: bookingId }));
      expect(transferred.status).toBe('transferred');
      expect(transferred.stripeTransferId).toMatch(/^tr_mock_/);

      // Running again finds nothing due: one payout per session.
      await runAgentBrowser(session, 'open', `${baseUrl}/admin`);
      await clickNamed(session, 'button', /^Run payouts$/);
      await runAgentBrowser(session, 'wait', '--text', 'Nothing was due.');
    } catch (error) {
      await captureBrowserFailure(session, 'checkpoint-7');
      throw error;
    }
  });
});
