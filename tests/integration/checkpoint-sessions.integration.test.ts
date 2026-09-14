import { createHmac } from 'node:crypto';
import { resolve } from 'node:path';
import { Booking, MikroORM, entities } from '@devmentor/db';
import { afterAll, describe, expect, inject, it } from 'vitest';
import {
  captureBrowserFailure,
  closeAgentBrowser,
  integrationArtifactsDirectory,
  runAgentBrowser,
  signInAs,
} from './agent-browser';
import { resetPublishedMentorProfile, seedOfferReadyMentor } from './fixtures/mentor';

/**
 * TEMPORARY — checkpoint 5 evidence for `om-auto-create-pr-loop` run
 * `2026-09-14-epic-03-booking-and-payment`. The permanent scenarios land at Steps 7.2–7.4.
 */

const MOCK_WEBHOOK_SECRET = 'mock-webhook-secret';

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

async function confirmPayment(baseUrl: string, databaseUrl: string): Promise<void> {
  const orm = await MikroORM.init({ clientUrl: databaseUrl, entities });
  await orm.connect();
  let checkoutSessionId: string;
  let priceCents: number;
  try {
    const booking = await orm.em.fork().findOneOrFail(Booking, { status: 'pending' });
    checkoutSessionId = booking.stripeCheckoutSessionId!;
    priceCents = booking.priceCents;
  } finally {
    await orm.close(true);
  }

  const rawBody = JSON.stringify({
    id: `evt_checkpoint_5_${process.pid}`,
    type: 'checkout.session.completed',
    checkoutSessionId,
    paymentIntentId: 'pi_checkpoint_5',
    amountTotalCents: priceCents,
    currency: 'PLN',
  });
  const response = await fetch(`${baseUrl}/api/payments/webhook`, {
    method: 'POST',
    headers: {
      'stripe-signature': createHmac('sha256', MOCK_WEBHOOK_SECRET).update(rawBody).digest('hex'),
    },
    body: rawBody,
  });
  if ((await response.text()) !== 'confirmed') {
    throw new Error('the webhook did not confirm the booking');
  }
}

describe('checkpoint 5 — both parties see the session', () => {
  const menteeSession = `checkpoint-sessions-mentee-${process.pid}`;
  const mentorSession = `checkpoint-sessions-mentor-${process.pid}`;
  const databaseUrl = inject('integrationDatabaseUrl');

  afterAll(async () => {
    await closeAgentBrowser(menteeSession);
    await closeAgentBrowser(mentorSession);
    await resetPublishedMentorProfile(databaseUrl);
  });

  it('takes a mentee from booking to a confirmed session, and shows the mentor too', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const mentor = await seedOfferReadyMentor(databaseUrl);
    const cdp = process.env.AGENT_BROWSER_CDP ?? '9222';

    try {
      await runAgentBrowser(menteeSession, 'connect', cdp);
      await signInAs(menteeSession, baseUrl, 'mock-mentee');

      // An empty sessions list explains itself.
      await runAgentBrowser(menteeSession, 'open', `${baseUrl}/home`);
      await runAgentBrowser(menteeSession, 'wait', '--text', 'No sessions yet');
      await runAgentBrowser(
        menteeSession,
        'screenshot',
        resolve(integrationArtifactsDirectory, 'checkpoint-5-mentee-empty.png'),
        '--full',
      );

      // Book and pay.
      await runAgentBrowser(menteeSession, 'open', `${baseUrl}/m/${mentor.slug}`);
      await clickNamed(menteeSession, 'button', /^\d{2}:\d{2}$/);
      await clickNamed(menteeSession, 'button', /25 minutes/);
      await clickNamed(menteeSession, 'button', /Continue to payment/);

      // The mock gateway sends the payer straight back, which is the hand-off this
      // checkpoint owed a screenshot of.
      await runAgentBrowser(menteeSession, 'wait', '--text', 'Your payment was sent');
      const banner = await runAgentBrowser(menteeSession, 'snapshot');
      expect(banner).toContain('Your payment was sent');
      // Returning from a checkout proves nothing, so the screen must not claim otherwise.
      expect(banner).not.toMatch(/booking is confirmed/i);
      await runAgentBrowser(
        menteeSession,
        'screenshot',
        resolve(integrationArtifactsDirectory, 'checkpoint-5-mentee-returned.png'),
        '--full',
      );

      await confirmPayment(baseUrl, databaseUrl);

      // Now it is a session, and the mentee has an unread notification about it.
      await runAgentBrowser(menteeSession, 'open', `${baseUrl}/home`);
      await runAgentBrowser(menteeSession, 'wait', '--text', 'Upcoming');
      const menteeList = await runAgentBrowser(menteeSession, 'snapshot');
      expect(menteeList).toContain('1 unread notification');
      expect(menteeList).toContain('A session was booked');
      expect(menteeList).toContain('Mock Mentor');
      expect(menteeList).toContain('25-minute text session');
      expect(menteeList).toContain('Sessions are text only');
      await runAgentBrowser(
        menteeSession,
        'screenshot',
        resolve(integrationArtifactsDirectory, 'checkpoint-5-mentee-confirmed.png'),
        '--full',
      );

      // The mentor sees the same session from the other side.
      await runAgentBrowser(mentorSession, 'connect', cdp);
      await signInAs(mentorSession, baseUrl, 'mock-mentor');
      await runAgentBrowser(mentorSession, 'open', `${baseUrl}/mentor/sessions`);
      await runAgentBrowser(mentorSession, 'wait', '--text', 'Upcoming');
      const mentorList = await runAgentBrowser(mentorSession, 'snapshot');
      expect(mentorList).toContain('Booked sessions');
      // The card names the *other* person. ("Mock Mentor" also appears in the shell's
      // "Signed in as" block, which is the mentor's own name and not a counterpart.)
      expect(mentorList).toContain('with Mock Mentee');
      expect(mentorList).toContain('Upcoming');
      await runAgentBrowser(
        mentorSession,
        'screenshot',
        resolve(integrationArtifactsDirectory, 'checkpoint-5-mentor-sessions.png'),
        '--full',
      );
    } catch (error) {
      await captureBrowserFailure(menteeSession, 'checkpoint-5-mentee');
      await captureBrowserFailure(mentorSession, 'checkpoint-5-mentor');
      throw error;
    }
  });
});
