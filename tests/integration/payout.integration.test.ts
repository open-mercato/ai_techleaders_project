import { MentorProfile, MikroORM, Payout } from '@devmentor/db';
import { afterEach, describe, expect, inject, it } from 'vitest';
import { closeAgentBrowser, runAgentBrowser, signInAs, signInCookieHeader } from './agent-browser';
import { clickNamed } from './browser-actions';
import {
  CSRF_HEADERS,
  bookAndPay,
  clearBookingData,
  moveSessionToThePast,
  withOrm,
} from './fixtures/booking';
import {
  resetPublishedMentorProfile,
  seedFutureMentorSlot,
  seedOfferReadyMentor,
} from './fixtures/mentor';

/**
 * E03-S06 (#25): the fee split, and paying the mentor their share.
 */

/** The two columns a payout decision reads. Onboarding itself is E02-S05 (#19). */
async function completeConnectOnboarding(databaseUrl: string, profileId: string) {
  await withOrm(databaseUrl, async (orm: MikroORM) => {
    const em = orm.em.fork();
    const profile = await em.findOneOrFail(MentorProfile, { id: profileId });
    profile.payoutsEnabled = true;
    profile.stripeConnectAccountId = `acct_${process.pid}`;
    await em.flush();
  });
}

async function readPayout(databaseUrl: string, bookingId: string) {
  return withOrm(databaseUrl, async (orm: MikroORM) =>
    orm.em.fork().findOneOrFail(Payout, { booking: bookingId }));
}

/** A session that has been paid for and has finished, which is what a payout is about. */
async function completedSession(baseUrl: string, databaseUrl: string, profileId: string, tag: string) {
  const slot = await seedFutureMentorSlot(
    databaseUrl,
    profileId,
    new Date(Date.now() + 24 * 60 * 60 * 1000),
  );
  const booking = await bookAndPay(baseUrl, databaseUrl, slot.slotId, { eventId: `evt_${tag}` });
  await moveSessionToThePast(databaseUrl, booking.id);
  return booking;
}

describe('TC-PAYOUT-001 the mentor share', () => {
  const session = `payout-${process.pid}`;
  const databaseUrl = inject('integrationDatabaseUrl');

  afterEach(async () => {
    await closeAgentBrowser(session);
    await clearBookingData(databaseUrl);
    await resetPublishedMentorProfile(databaseUrl);
  });

  it('holds the share without Connect onboarding, and tells the mentor', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const mentor = await seedOfferReadyMentor(databaseUrl);
    const booking = await completedSession(baseUrl, databaseUrl, mentor.profileId, 'held');
    const operator = await signInCookieHeader(baseUrl, 'mock-operator');

    const run = await fetch(`${baseUrl}/api/operator/payouts/run`, {
      method: 'POST',
      headers: { ...CSRF_HEADERS, cookie: operator },
    });
    const { data } = (await run.json()) as {
      data: { transferred: number; held: number; failed: number };
    };

    expect(data).toEqual({ transferred: 0, held: 1, failed: 0 });
    const held = await readPayout(databaseUrl, booking.id);
    expect(held.status).toBe('held');
    expect(held.heldReason).toBe('connect_onboarding_incomplete');
    // 80% of PLN 90.00, with the 20% fee snapshotted on the booking.
    expect(held.amountCents).toBe(7_200);

    // The mentor sees the money waiting, and what it is waiting for.
    await signInAs(session, baseUrl, 'mock-mentor');
    await runAgentBrowser(session, 'open', `${baseUrl}/mentor/payouts`);
    await runAgentBrowser(session, 'wait', '--text', 'Session payout');
    const view = await runAgentBrowser(session, 'snapshot');
    expect(view).toContain('PLN 90.00');
    expect(view).toContain('PLN 18.00');
    expect(view).toContain('PLN 72.00');
    expect(view).toContain('Set it up to receive this and later payouts');

    await runAgentBrowser(session, 'open', `${baseUrl}/mentor`);
    await runAgentBrowser(session, 'wait', '--text', 'A payout is waiting');
  });

  it('transfers the share once onboarding is complete, and only once', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const mentor = await seedOfferReadyMentor(databaseUrl);
    await completeConnectOnboarding(databaseUrl, mentor.profileId);
    const booking = await completedSession(baseUrl, databaseUrl, mentor.profileId, 'sent');

    await signInAs(session, baseUrl, 'mock-operator');
    await runAgentBrowser(session, 'open', `${baseUrl}/admin`);
    await clickNamed(session, 'button', /^Run payouts$/);
    await runAgentBrowser(session, 'wait', '--text', '1 transferred, 0 held, 0 failed.');

    const transferred = await readPayout(databaseUrl, booking.id);
    expect(transferred.status).toBe('transferred');
    expect(transferred.stripeTransferId).toMatch(/^tr_mock_/);

    // Running again finds nothing due: one payout per session, enforced by a unique index,
    // which is what makes a by-hand run safe to trigger twice.
    await runAgentBrowser(session, 'open', `${baseUrl}/admin`);
    await clickNamed(session, 'button', /^Run payouts$/);
    await runAgentBrowser(session, 'wait', '--text', 'Nothing was due.');
  });

  it('takes no fee and creates no payout for a refunded session', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const mentor = await seedOfferReadyMentor(databaseUrl);
    await completeConnectOnboarding(databaseUrl, mentor.profileId);
    const slot = await seedFutureMentorSlot(
      databaseUrl,
      mentor.profileId,
      new Date(Date.now() + 72 * 60 * 60 * 1000),
    );
    const booking = await bookAndPay(baseUrl, databaseUrl, slot.slotId, { eventId: 'evt_refund' });

    await fetch(`${baseUrl}/api/bookings/${booking.id}/cancel`, {
      method: 'POST',
      headers: { ...CSRF_HEADERS, cookie: booking.cookie },
    });
    await moveSessionToThePast(databaseUrl, booking.id);

    const operator = await signInCookieHeader(baseUrl, 'mock-operator');
    const run = await fetch(`${baseUrl}/api/operator/payouts/run`, {
      method: 'POST',
      headers: { ...CSRF_HEADERS, cookie: operator },
    });
    const { data } = (await run.json()) as { data: { transferred: number; held: number } };

    // Never selected, so no fee is taken — by not creating the payout, rather than by
    // creating one and reversing it.
    expect(data).toEqual({ transferred: 0, held: 0, failed: 0 });
    await expect(readPayout(databaseUrl, booking.id)).rejects.toThrow();
  });

  it('leaves a session that has not finished for a later run', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const mentor = await seedOfferReadyMentor(databaseUrl);
    await completeConnectOnboarding(databaseUrl, mentor.profileId);
    // Booked and paid for, but the session is still ahead: paying now would send money for
    // a session that has not happened.
    const booking = await bookAndPay(baseUrl, databaseUrl, mentor.slotId, {
      eventId: 'evt_future',
    });

    const operator = await signInCookieHeader(baseUrl, 'mock-operator');
    const run = await fetch(`${baseUrl}/api/operator/payouts/run`, {
      method: 'POST',
      headers: { ...CSRF_HEADERS, cookie: operator },
    });
    const { data } = (await run.json()) as { data: { transferred: number } };

    expect(data.transferred).toBe(0);
    await expect(readPayout(databaseUrl, booking.id)).rejects.toThrow();
  });

  it('refuses the run to anybody who is not an operator', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const mentee = await signInCookieHeader(baseUrl, 'mock-mentee');

    const refused = await fetch(`${baseUrl}/api/operator/payouts/run`, {
      method: 'POST',
      headers: { ...CSRF_HEADERS, cookie: mentee },
    });

    expect(refused.status).toBe(403);
  });
});
