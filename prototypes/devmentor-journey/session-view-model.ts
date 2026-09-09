import type { MentorReview, MentorReviewValues } from '@devmentor/ui';
import type { DemoUser } from './auth-model';
import { INITIAL_SLOTS, type Slot } from './flow';

export type ConfirmedSession = {
  mentorId: string;
  mentorName: string;
  buyerId: string;
  buyerName: string;
  slot: Slot;
  price: number;
  duration: 25 | 50;
};
export type ReviewsByMentor = Record<string, MentorReview[]>;
export const INITIAL_SESSION: ConfirmedSession = {
  mentorId: 'alex', mentorName: 'Alex Laurent', buyerId: 'jordan', buyerName: 'Jordan Lee',
  slot: INITIAL_SLOTS[1], price: 180, duration: 25,
};

/** A confirmed session belongs to its buyer and mentor, including after account switches. */
export function sessionForUser(session: ConfirmedSession | null, user: DemoUser | null): ConfirmedSession | null {
  if (!session || !user) return null;
  const isBuyer = user.id === session.buyerId && user.roles.includes('mentee');
  const isMentor = user.id === session.mentorId && user.roles.includes('mentor');
  return isBuyer || isMentor ? { ...session, slot: { ...session.slot } } : null;
}

export const sessionKey = (session: ConfirmedSession) => `${session.buyerId}-${session.mentorId}-${session.slot.id}`;

export function createSessionReview(session: ConfirmedSession, values: MentorReviewValues): MentorReview {
  return {
    ...values, id: sessionKey(session), reviewerName: session.buyerName,
    createdAt: new Date(Date.parse(session.slot.start) + (session.duration + 5) * 60_000).toISOString(),
    dateLabel: 'After your session',
  };
}

export function upsertMentorReview(current: ReviewsByMentor, mentorId: string, review: MentorReview): ReviewsByMentor {
  return { ...current, [mentorId]: [review, ...(current[mentorId] ?? []).filter(item => item.id !== review.id)] };
}
