import { describe, expect, it, vi } from 'vitest';
import {
  MAX_MESSAGE_LENGTH,
  SessionMessage,
  type EntityManager,
  type IBooking,
  type IMentorProfile,
  type ISessionMessage,
  type IUser,
} from '@devmentor/db';
import type { Session } from '../../http/auth';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from '../../http/errors';
import {
  MAX_SESSION_MESSAGES,
  SESSION_ENDED_MESSAGE,
  SESSION_FULL_MESSAGE,
  SESSION_NOT_A_PARTY_MESSAGE,
  SESSION_NOT_FOUND_MESSAGE,
  SESSION_NOT_STARTED_MESSAGE,
  TextSessionService,
  sessionWindow,
} from './text-session.service';

const MENTEE_ID = '10000000-0000-4000-8000-000000000001';
const MENTOR_USER_ID = '20000000-0000-4000-8000-000000000002';
const STRANGER_ID = '90000000-0000-4000-8000-000000000009';
const BOOKING_ID = '50000000-0000-4000-8000-000000000001';

const STARTS_AT = new Date('2026-09-14T16:00:00.000Z');
/** 16:00 + 50 minutes. */
const ENDS_AT = new Date('2026-09-14T16:50:00.000Z');
const DURING = new Date('2026-09-14T16:20:00.000Z');
const BEFORE = new Date('2026-09-14T15:59:59.999Z');

function booking(overrides: Partial<IBooking> = {}): IBooking {
  return {
    id: BOOKING_ID,
    status: 'confirmed',
    startsAt: STARTS_AT,
    lengthMinutes: 50,
    mentee: { id: MENTEE_ID, displayName: 'Jamie Chen' } as IUser,
    mentorProfile: {
      user: { id: MENTOR_USER_ID, displayName: 'Alex Laurent' } as IUser,
    } as IMentorProfile,
    ...overrides,
  } as IBooking;
}

function storedMessage(overrides: Partial<ISessionMessage> = {}): ISessionMessage {
  return {
    id: 'm1',
    author: { id: MENTEE_ID, displayName: 'Jamie Chen' } as IUser,
    body: 'Where should I validate it?',
    createdAt: new Date('2026-09-14T16:01:00.000Z'),
    ...overrides,
  } as ISessionMessage;
}

function makeHarness({
  session = { userId: MENTEE_ID, roles: ['mentee'] } as Session,
  stored = booking(),
  messages = [storedMessage()],
  now = DURING,
  count = 0,
}: {
  session?: Session | null | Promise<Session | null>;
  stored?: IBooking | null;
  messages?: ISessionMessage[];
  now?: Date;
  count?: number;
} = {}) {
  let created: Record<string, unknown> | null = null;
  const em = {
    findOne: vi.fn(async () => stored),
    find: vi.fn(async () => messages),
    count: vi.fn(async () => count),
    create: vi.fn((_entity: unknown, data: Record<string, unknown>) => {
      created = { id: 'created-message', createdAt: now, ...data };
      return created;
    }),
    persist: vi.fn(),
    flush: vi.fn(async () => undefined),
  };
  const service = new TextSessionService({
    em: em as unknown as EntityManager,
    clock: { now: () => now },
    session: session instanceof Promise ? session : Promise.resolve(session),
  });
  return { service, em, get created() { return created; } };
}

describe('sessionWindow', () => {
  it.each([
    { at: BEFORE, state: 'not_started' },
    { at: STARTS_AT, state: 'open' },
    { at: DURING, state: 'open' },
    { at: new Date(ENDS_AT.getTime() - 1), state: 'open' },
    { at: ENDS_AT, state: 'ended' },
    { at: new Date(ENDS_AT.getTime() + 60_000), state: 'ended' },
  ])('is $state at $at', ({ at, state }) => {
    expect(sessionWindow(booking(), at).state).toBe(state);
  });

  it('ends a 25-minute session 25 minutes after it starts', () => {
    const short = booking({ lengthMinutes: 25 });

    expect(sessionWindow(short, STARTS_AT).endsAt).toBe('2026-09-14T16:25:00.000Z');
    expect(sessionWindow(short, new Date('2026-09-14T16:25:00.000Z')).state).toBe('ended');
    expect(sessionWindow(short, new Date('2026-09-14T16:24:59.999Z')).state).toBe('open');
  });

  it('reports both instants so the browser never computes the window itself', () => {
    expect(sessionWindow(booking(), DURING)).toEqual({
      state: 'open',
      startsAt: '2026-09-14T16:00:00.000Z',
      endsAt: '2026-09-14T16:50:00.000Z',
    });
  });
});

describe('TextSessionService.getForParty', () => {
  it('gives the mentee the transcript, the counterpart and their own id', async () => {
    const { service } = makeHarness();

    await expect(service.getForParty(BOOKING_ID)).resolves.toEqual({
      bookingId: BOOKING_ID,
      viewerUserId: MENTEE_ID,
      counterpartName: 'Alex Laurent',
      lengthMinutes: 50,
      window: {
        state: 'open',
        startsAt: '2026-09-14T16:00:00.000Z',
        endsAt: '2026-09-14T16:50:00.000Z',
      },
      messages: [
        {
          id: 'm1',
          authorId: MENTEE_ID,
          authorName: 'Jamie Chen',
          body: 'Where should I validate it?',
          createdAt: '2026-09-14T16:01:00.000Z',
        },
      ],
      maxMessageLength: MAX_MESSAGE_LENGTH,
    });
  });

  it('names the mentee as the counterpart when the mentor is reading', async () => {
    const { service } = makeHarness({
      session: { userId: MENTOR_USER_ID, roles: ['mentor'] } as Session,
    });

    const view = await service.getForParty(BOOKING_ID);

    expect(view.counterpartName).toBe('Jamie Chen');
    expect(view.viewerUserId).toBe(MENTOR_USER_ID);
  });

  it('reads the transcript in created order with a stable tiebreaker, capped', async () => {
    const { service, em } = makeHarness();

    await service.getForParty(BOOKING_ID);

    expect(em.find).toHaveBeenCalledWith(
      SessionMessage,
      { booking: BOOKING_ID },
      {
        populate: ['author'],
        orderBy: { createdAt: 'asc', id: 'asc' },
        limit: MAX_SESSION_MESSAGES,
      },
    );
  });

  it('returns an empty transcript rather than nothing when no one has written yet', async () => {
    const { service } = makeHarness({ messages: [] });

    await expect(service.getForParty(BOOKING_ID)).resolves.toMatchObject({ messages: [] });
  });

  it('refuses a caller with no session', async () => {
    const { service, em } = makeHarness({ session: null });

    await expect(service.getForParty(BOOKING_ID)).rejects.toBeInstanceOf(UnauthorizedError);
    expect(em.findOne).not.toHaveBeenCalled();
  });

  it('refuses a user who is neither party, and says why without leaking the session', async () => {
    const { service, em } = makeHarness({
      session: { userId: STRANGER_ID, roles: ['mentee', 'mentor', 'operator'] } as Session,
    });

    await expect(service.getForParty(BOOKING_ID)).rejects.toMatchObject({
      code: 'forbidden',
      message: SESSION_NOT_A_PARTY_MESSAGE,
    });
    await expect(service.getForParty(BOOKING_ID)).rejects.toBeInstanceOf(ForbiddenError);
    expect(em.find).not.toHaveBeenCalled();
  });

  it('does not exist for a booking id nobody has', async () => {
    const { service } = makeHarness({ stored: null });

    await expect(service.getForParty(BOOKING_ID)).rejects.toMatchObject({
      code: 'not_found',
      message: SESSION_NOT_FOUND_MESSAGE,
    });
  });

  it.each(['pending', 'expired', 'cancelled'] as const)(
    'does not exist while the booking is %s',
    async (status) => {
      const { service } = makeHarness({ stored: booking({ status }) });

      await expect(service.getForParty(BOOKING_ID)).rejects.toBeInstanceOf(NotFoundError);
    },
  );
});

describe('TextSessionService.postMessage', () => {
  it('stores a message from a party while the window is open', async () => {
    const harness = makeHarness();

    const posted = await harness.service.postMessage(BOOKING_ID, { body: 'That helps.' });

    expect(posted).toEqual({
      id: 'created-message',
      authorId: MENTEE_ID,
      authorName: 'Jamie Chen',
      body: 'That helps.',
      createdAt: DURING.toISOString(),
    });
    expect(harness.em.persist).toHaveBeenCalledOnce();
    expect(harness.em.flush).toHaveBeenCalledOnce();
  });

  it('attributes the message to the loaded party, so it carries a name', async () => {
    const harness = makeHarness({
      session: { userId: MENTOR_USER_ID, roles: ['mentor'] } as Session,
    });

    const posted = await harness.service.postMessage(BOOKING_ID, { body: 'Paste the type.' });

    expect(posted.authorId).toBe(MENTOR_USER_ID);
    expect(posted.authorName).toBe('Alex Laurent');
  });

  it('refuses a post before the session starts, and stores nothing', async () => {
    const harness = makeHarness({ now: BEFORE });

    await expect(harness.service.postMessage(BOOKING_ID, { body: 'Early' })).rejects.toMatchObject({
      code: 'conflict',
      message: SESSION_NOT_STARTED_MESSAGE,
    });
    expect(harness.em.persist).not.toHaveBeenCalled();
    expect(harness.em.flush).not.toHaveBeenCalled();
  });

  it('refuses a post after the session ended and points at the written answer', async () => {
    const harness = makeHarness({ now: ENDS_AT });

    await expect(harness.service.postMessage(BOOKING_ID, { body: 'Late' })).rejects.toMatchObject({
      code: 'conflict',
      message: SESSION_ENDED_MESSAGE,
    });
    await expect(harness.service.postMessage(BOOKING_ID, { body: 'Late' }))
      .rejects.toBeInstanceOf(ConflictError);
    expect(harness.em.persist).not.toHaveBeenCalled();
  });

  it('refuses a post once the session holds its message limit', async () => {
    const harness = makeHarness({ count: MAX_SESSION_MESSAGES });

    await expect(harness.service.postMessage(BOOKING_ID, { body: 'One more' })).rejects.toMatchObject({
      code: 'conflict',
      message: SESSION_FULL_MESSAGE,
    });
    expect(harness.em.persist).not.toHaveBeenCalled();
  });

  it('accepts the message that reaches the limit but not the one after it', async () => {
    const harness = makeHarness({ count: MAX_SESSION_MESSAGES - 1 });

    await expect(harness.service.postMessage(BOOKING_ID, { body: 'The last one' }))
      .resolves.toMatchObject({ body: 'The last one' });
  });

  it('refuses a user who is neither party before reading the clock', async () => {
    const harness = makeHarness({
      session: { userId: STRANGER_ID, roles: ['operator'] } as Session,
    });

    await expect(harness.service.postMessage(BOOKING_ID, { body: 'Let me in' }))
      .rejects.toBeInstanceOf(ForbiddenError);
    expect(harness.em.count).not.toHaveBeenCalled();
  });

  it('refuses a post to a booking that is not confirmed', async () => {
    const harness = makeHarness({ stored: booking({ status: 'cancelled' }) });

    await expect(harness.service.postMessage(BOOKING_ID, { body: 'Hello' }))
      .rejects.toBeInstanceOf(NotFoundError);
  });

  it('surfaces a failed session lookup without an unhandled rejection', async () => {
    const failure = new Error('session lookup failed');
    const harness = makeHarness({ session: Promise.reject(failure) });

    // The constructor attaches its own catch, so the rejection cannot crash the process
    // before a caller awaits it; the caller still gets the original failure.
    await expect(harness.service.postMessage(BOOKING_ID, { body: 'Hello' })).rejects.toBe(failure);
  });

  it('refuses a post with no session at all', async () => {
    const harness = makeHarness({ session: null });

    await expect(harness.service.postMessage(BOOKING_ID, { body: 'Hello' }))
      .rejects.toBeInstanceOf(UnauthorizedError);
  });
});
