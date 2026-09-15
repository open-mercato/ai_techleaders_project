import { MentorProfile, MikroORM, Slot, User } from '@devmentor/db';
import { afterEach, describe, expect, inject, it } from 'vitest';
import { closeAgentBrowser, runAgentBrowser, signInAs, signInCookieHeader } from './agent-browser';
import { bookAndPay, clearBookingData, withOrm } from './fixtures/booking';
import {
  resetPublishedMentorProfile,
  seedFutureMentorSlot,
  seedOfferReadyMentor,
} from './fixtures/mentor';

/**
 * E03-S04 (#23): both parties are told, and each sees only their own sessions.
 */

const OTHER_MENTOR_EMAIL = `other-mentor-${process.pid}@devmentor.test`;

/**
 * A second, unrelated mentor with a bookable time.
 *
 * Data scoping cannot be proved against one mentor: a query with no `where` at all would
 * pass. This exists so the assertion has something it could wrongly return.
 */
async function seedSecondMentor(databaseUrl: string) {
  return withOrm(databaseUrl, async (orm: MikroORM) => {
    const em = orm.em.fork();
    const user = em.create(User, {
      email: OTHER_MENTOR_EMAIL,
      displayName: 'Other Mentor',
      roles: ['mentor'],
      emailVerifiedAt: new Date(),
    });
    const profile = em.create(MentorProfile, {
      user,
      headline: '',
      bio: 'I mentor somebody else entirely.',
      slug: `other-mentor-${process.pid}`,
      publicWorkUrl: 'https://example.com/other',
      stackTags: ['React'],
      publishedAt: new Date(),
      price25Cents: 9_000,
      price50Cents: 18_000,
    });
    em.persist([user, profile]);
    await em.flush();
    return { profileId: profile.id };
  });
}

async function removeSecondMentor(databaseUrl: string) {
  await withOrm(databaseUrl, async (orm: MikroORM) => {
    const em = orm.em.fork();
    const user = await em.findOne(User, { email: OTHER_MENTOR_EMAIL });
    if (user === null) return;
    const profile = await em.findOne(MentorProfile, { user: user.id });
    if (profile !== null) await em.nativeDelete(Slot, { mentorProfile: profile.id });
    await em.nativeDelete(User, { id: user.id });
  });
}

describe('TC-SESSIONS-001 each party sees their own sessions', () => {
  const session = `sessions-list-${process.pid}`;
  const databaseUrl = inject('integrationDatabaseUrl');

  afterEach(async () => {
    await closeAgentBrowser(session);
    await clearBookingData(databaseUrl);
    await removeSecondMentor(databaseUrl);
    await resetPublishedMentorProfile(databaseUrl);
  });

  it('keeps one mentor sessions out of another mentor list', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const mentor = await seedOfferReadyMentor(databaseUrl);
    const other = await seedSecondMentor(databaseUrl);
    const otherSlot = await seedFutureMentorSlot(
      databaseUrl,
      other.profileId,
      new Date(Date.now() + 30 * 60 * 60 * 1000),
    );

    await bookAndPay(baseUrl, databaseUrl, mentor.slotId, { eventId: 'evt_scoping_a' });
    await bookAndPay(baseUrl, databaseUrl, otherSlot.slotId, { eventId: 'evt_scoping_b' });

    const cookie = await signInCookieHeader(baseUrl, 'mock-mentor');
    const response = await fetch(`${baseUrl}/api/bookings?as=mentor`, { headers: { cookie } });
    const { data } = (await response.json()) as { data: { counterpartName: string }[] };

    // The mock mentor was booked once. The other mentor's session is not theirs to see,
    // and there is a second row in the table that a missing `where` would have returned.
    expect(data).toHaveLength(1);
    expect(data[0]!.counterpartName).toBe('Mock Mentee');
  });

  it('tells both parties, and shows each their own side', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const mentor = await seedOfferReadyMentor(databaseUrl);
    await bookAndPay(baseUrl, databaseUrl, mentor.slotId, { eventId: 'evt_notify' });

    // The mentee: a session, and an unread notification about it.
    await signInAs(session, baseUrl, 'mock-mentee');
    await runAgentBrowser(session, 'open', `${baseUrl}/home`);
    await runAgentBrowser(session, 'wait', '--text', 'Upcoming');
    const menteeView = await runAgentBrowser(session, 'snapshot');
    expect(menteeView).toContain('1 unread notification');
    expect(menteeView).toContain('A session was booked');
    expect(menteeView).toContain('with Mock Mentor');
    expect(menteeView).toContain('25-minute text session');
    expect(menteeView).toContain('Sessions are text only');

    // The mentor: the same session, named from the other side, and their own notification.
    await signInAs(session, baseUrl, 'mock-mentor');
    await runAgentBrowser(session, 'open', `${baseUrl}/mentor/sessions`);
    await runAgentBrowser(session, 'wait', '--text', 'Upcoming');
    const mentorView = await runAgentBrowser(session, 'snapshot');
    expect(mentorView).toContain('with Mock Mentee');

    await runAgentBrowser(session, 'open', `${baseUrl}/mentor`);
    await runAgentBrowser(session, 'wait', '--text', 'unread notification');
    expect(await runAgentBrowser(session, 'snapshot')).toContain('A session was booked');
  });

  it('says nothing to anybody about a booking that was never confirmed', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const mentor = await seedOfferReadyMentor(databaseUrl);
    const cookie = await signInCookieHeader(baseUrl, 'mock-mentee');

    await fetch(`${baseUrl}/api/bookings`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-devmentor-request': '1', cookie },
      body: JSON.stringify({ slotId: mentor.slotId, lengthMinutes: 25 }),
    });

    const notifications = await fetch(`${baseUrl}/api/notifications`, { headers: { cookie } });
    const { data } = (await notifications.json()) as { data: unknown[] };

    // Nothing subscribes to a pending booking, so an unpaid reservation notifies nobody.
    expect(data).toEqual([]);
  });
});
