import { resolve } from 'node:path';
import { afterAll, describe, expect, inject, it } from 'vitest';
import {
  captureBrowserFailure,
  closeAgentBrowser,
  integrationArtifactsDirectory,
  runAgentBrowser,
  signInAs,
} from './agent-browser';
import { expectAbsent } from './assertions';
import { resetPublishedMentorProfile, seedOfferReadyMentor } from './fixtures/mentor';

/**
 * Click the element the accessibility tree names, rather than a guessed CSS path.
 * `snapshot -i --json` returns `refs: { e1: { role, name } }`; refs are reassigned on every
 * snapshot, so this takes a fresh one each time.
 */
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
 * TEMPORARY — checkpoint 2 evidence for `om-auto-create-pr-loop` run
 * `2026-09-14-epic-03-booking-and-payment`. The permanent scenario lands at Step 7.2.
 */
describe('checkpoint 2 — picking a slot and a length', () => {
  const session = `checkpoint-booking-${process.pid}`;
  const databaseUrl = inject('integrationDatabaseUrl');

  afterAll(async () => {
    await closeAgentBrowser(session);
    await resetPublishedMentorProfile(databaseUrl);
  });

  it('shows the mentor price for the chosen length and reserves the time', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const mentor = await seedOfferReadyMentor(databaseUrl);

    try {
      await runAgentBrowser(session, 'connect', process.env.AGENT_BROWSER_CDP ?? '9222');

      // Signed out first: the page must offer the choice and route to sign-in, not refuse.
      await runAgentBrowser(session, 'open', `${baseUrl}/m/${mentor.slug}`);
      const signedOut = await runAgentBrowser(session, 'snapshot');
      expect(signedOut).toContain('Book a session');
      expect(signedOut).toContain('Sessions are text only');
      expectAbsent(
        signedOut,
        { text: /within an hour|as soon as|fast reply|quick answer/i },
        { tree: 'the signed-out booking panel', provenBy: [{ role: 'heading', text: 'Book a session' }] },
      );
      await runAgentBrowser(
        session,
        'screenshot',
        resolve(integrationArtifactsDirectory, 'checkpoint-2-booking-signed-out.png'),
        '--full',
      );

      await signInAs(session, baseUrl, 'mock-mentee');
      await runAgentBrowser(session, 'open', `${baseUrl}/m/${mentor.slug}`);

      // Choose the seeded time, then a length, and read the price back off the summary.
      const picked = await runAgentBrowser(session, 'snapshot');
      expect(picked).toContain('Choose a time');
      expect(picked).toContain('25 minutes');
      expect(picked).toContain('PLN 90.00');
      expect(picked).toContain('PLN 180.00');

      await clickNamed(session, 'button', /^\d{2}:\d{2}$/);
      await clickNamed(session, 'button', /50 minutes/);
      const summary = await runAgentBrowser(session, 'snapshot');
      expect(summary).toContain('Your session with Mock Mentor');
      expect(summary).toContain('50-minute text session');
      expect(summary).toContain('PLN 180.00');
      await runAgentBrowser(
        session,
        'screenshot',
        resolve(integrationArtifactsDirectory, 'checkpoint-2-booking-summary.png'),
        '--full',
      );

      await clickNamed(session, 'button', /Continue to payment/);
      await runAgentBrowser(session, 'wait', '--text', 'This time is held for you while you pay.');
      const held = await runAgentBrowser(session, 'snapshot');
      expect(held).toContain('This time is held for you while you pay.');
      await runAgentBrowser(
        session,
        'screenshot',
        resolve(integrationArtifactsDirectory, 'checkpoint-2-booking-held.png'),
        '--full',
      );
    } catch (error) {
      await captureBrowserFailure(session, 'checkpoint-2-booking');
      throw error;
    }
  });
});
