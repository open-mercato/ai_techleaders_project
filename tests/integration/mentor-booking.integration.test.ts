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
import { expectAbsent } from './assertions';
import { clickNamed } from './browser-actions';
import { CSRF_HEADERS, clearBookingData } from './fixtures/booking';
import { resetPublishedMentorProfile, seedOfferReadyMentor } from './fixtures/mentor';

/**
 * E03-S01 (#20) and E03-S02 (#21): finding a mentor, and reserving one of their times.
 */
describe('TC-BOOKING-001 discovery and reservation', () => {
  const session = `mentor-booking-${process.pid}`;
  const databaseUrl = inject('integrationDatabaseUrl');

  afterEach(async () => {
    await closeAgentBrowser(session);
    await clearBookingData(databaseUrl);
    await resetPublishedMentorProfile(databaseUrl);
  });

  it('lists a bookable mentor by tag, with no search and no ranking', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const mentor = await seedOfferReadyMentor(databaseUrl);

    try {
      await runAgentBrowser(session, 'open', `${baseUrl}/mentors`);
      const listed = await runAgentBrowser(session, 'snapshot');
      expect(listed).toContain('Mock Mentor');
      expect(listed).toContain('PLN 90.00');
      expect(listed).toContain('PLN 180.00');

      // R13 and N02 are negative criteria, so they are asserted as absences — with a
      // positive control, so an empty snapshot cannot pass.
      expectAbsent(
        listed,
        { role: 'searchbox' },
        { tree: 'the public mentor list', provenBy: [{ role: 'heading', text: 'Find a mentor' }] },
      );
      expectAbsent(
        listed,
        { text: /rating|review|score|featured/i },
        { tree: 'the public mentor list', provenBy: [{ role: 'heading', text: 'Find a mentor' }] },
      );

      // The mentor carries TypeScript and AI agents, so one tag keeps them and another
      // removes them.
      await runAgentBrowser(session, 'open', `${baseUrl}/mentors?tag=TypeScript`);
      expect(await runAgentBrowser(session, 'snapshot')).toContain('Mock Mentor');

      await runAgentBrowser(session, 'open', `${baseUrl}/mentors?tag=Python`);
      const empty = await runAgentBrowser(session, 'snapshot');
      expect(empty).toContain('No mentors with Python are bookable right now');
      expect(empty).not.toContain('Mock Mentor');

      expect(mentor.slug).toMatch(/^mock-mentor-/);
    } catch (error) {
      await captureBrowserFailure(session, 'mentor-list');
      throw error;
    }
  });

  it('shows a mentee the price for the length they chose before they pay', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const mentor = await seedOfferReadyMentor(databaseUrl);

    try {
      // Signed out: the panel is offered rather than refused, and promises nothing.
      await runAgentBrowser(session, 'open', `${baseUrl}/m/${mentor.slug}`);
      const signedOut = await runAgentBrowser(session, 'snapshot');
      expect(signedOut).toContain('Book a session');
      expect(signedOut).toContain('Sessions are text only');
      expectAbsent(
        signedOut,
        { text: /within an hour|as soon as|fast reply|quick answer/i },
        {
          tree: 'the signed-out booking panel',
          provenBy: [{ role: 'heading', text: 'Book a session' }],
        },
      );

      await signInAs(session, baseUrl, 'mock-mentee');
      await runAgentBrowser(session, 'open', `${baseUrl}/m/${mentor.slug}`);
      await clickNamed(session, 'button', /^\d{2}:\d{2}$/);
      await clickNamed(session, 'button', /50 minutes/);

      const summary = await runAgentBrowser(session, 'snapshot');
      expect(summary).toContain('Your session with Mock Mentor');
      expect(summary).toContain('50-minute text session');
      // The mentor's own price for the length chosen, shown before anything is charged.
      expect(summary).toContain('PLN 180.00');

      await clickNamed(session, 'button', /Continue to payment/);
      await runAgentBrowser(session, 'wait', '--text', 'Your payment was sent');
      await runAgentBrowser(
        session,
        'screenshot',
        resolve(integrationArtifactsDirectory, 'booking-reserved.png'),
        '--full',
      );
    } catch (error) {
      await captureBrowserFailure(session, 'booking-pick');
      throw error;
    }
  });

  it('gives one slot to one mentee when two reserve it at the same instant', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const mentor = await seedOfferReadyMentor(databaseUrl);
    const cookie = await signInCookieHeader(baseUrl, 'mock-mentee');

    const reserve = () => fetch(`${baseUrl}/api/bookings`, {
      method: 'POST',
      headers: { ...CSRF_HEADERS, cookie },
      body: JSON.stringify({ slotId: mentor.slotId, lengthMinutes: 25 }),
    });

    // Genuinely concurrent: the two requests are in flight together, so the winner is
    // decided by `bookings_active_slot_unique` rather than by a check the loser also passed.
    const [first, second] = await Promise.all([reserve(), reserve()]);
    const statuses = [first.status, second.status].sort((a, b) => a - b);

    expect(statuses).toEqual([200, 409]);
  });
});
