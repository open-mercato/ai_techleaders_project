import { expect, it } from 'vitest';
import type { DemoUser } from './auth-model';
import { createSessionReview, INITIAL_SESSION, sessionForUser, sessionKey, upsertMentorReview, type ConfirmedSession } from './session-view-model';

const session: ConfirmedSession = {
  mentorId: 'taylor', mentorName: 'Taylor Morgan', buyerId: 'robin', buyerName: 'Robin Chen',
  slot: { id: 'mentor-slot-1', start: '2026-09-12T12:00:00Z' }, price: 380, duration: 50,
};
const user = (id: string, roles: DemoUser['roles']): DemoUser => ({ id, roles, email: `${id}@example.test`, displayName: id });

it('shows a booking only to its buyer or mentor with the matching role', () => {
  expect(sessionForUser(null, user('robin', ['mentee']))).toBeNull();
  expect(sessionForUser(session, null)).toBeNull();
  expect(sessionForUser(session, user('robin', ['mentee']))).toEqual(session);
  expect(sessionForUser(session, user('taylor', ['mentor']))).toEqual(session);
  expect(sessionForUser(session, user('robin', ['mentee', 'mentor']))).toEqual(session);
  expect(sessionForUser(session, user('taylor', ['mentee', 'mentor']))).toEqual(session);
  for (const wrong of [user('alex', ['mentor']), user('sam', ['operator', 'mentor']), user('jordan', ['mentee']), user('robin', ['mentor']), user('taylor', ['mentee'])]) expect(sessionForUser(session, wrong)).toBeNull();
  expect(sessionForUser(INITIAL_SESSION, user('jordan', ['mentee']))?.mentorName).toBe('Alex Laurent');
});

it('returns a defensive snapshot so a later profile or price change cannot alter a confirmed booking', () => {
  const visible = sessionForUser(session, user('robin', ['mentee']))!;
  visible.price = 999;
  visible.mentorName = 'Changed name';
  visible.slot.start = 'invalid';
  expect(sessionForUser(session, user('taylor', ['mentor']))).toEqual({ ...session, price: 380, mentorName: 'Taylor Morgan', slot: { id: 'mentor-slot-1', start: '2026-09-12T12:00:00Z' } });
});

it('associates a review with the actual booked mentor and buyer without changing another mentor’s reviews', () => {
  const original = createSessionReview(INITIAL_SESSION, { rating: 4, text: 'The API example helped.' });
  const review = createSessionReview(session, { rating: 5, text: 'Taylor helped me test the form.' });
  expect(review).toEqual({ id: sessionKey(session), rating: 5, text: 'Taylor helped me test the form.', reviewerName: 'Robin Chen', createdAt: '2026-09-12T12:55:00.000Z', dateLabel: 'After your session' });
  const current = { alex: [original] };
  const added = upsertMentorReview(current, 'taylor', review);
  expect(added).toEqual({ alex: [original], taylor: [review] });
  expect(current).toEqual({ alex: [original] });
  const another = { ...review, id: 'different-session', reviewerName: 'Casey Rivera' };
  const replaced = upsertMentorReview({ ...added, taylor: [review, another] }, 'taylor', { ...review, rating: 4 });
  expect(replaced.taylor).toEqual([{ ...review, rating: 4 }, another]);
  expect(replaced.alex).toEqual([original]);
});
