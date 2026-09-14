import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Booking,
  Notification,
  type EntityManager,
  type IBooking,
  type INotification,
} from '@devmentor/db';
import type { AppEnv } from '../../config/env';
import type { Logger } from '../../logger';
import type { Session } from '../../http/auth';
import { ForbiddenError, NotFoundError, UnauthorizedError } from '../../http/errors';
import type { MailMessage } from './mailer.port';
import { NotificationService, toNotificationDto } from './notification.service';

const NOW = new Date('2026-09-14T12:00:00.000Z');
const APP_URL = 'https://devmentor.test';
const MENTEE_ID = '10000000-0000-4000-8000-000000000001';
const MENTOR_USER_ID = '10000000-0000-4000-8000-000000000002';
const BOOKING_ID = '50000000-0000-4000-8000-000000000001';

function booking(): IBooking {
  return {
    id: BOOKING_ID,
    mentee: { id: MENTEE_ID, displayName: 'Ada Lovelace', email: 'ada@devmentor.test' },
    mentorProfile: {
      id: 'profile-1',
      user: { id: MENTOR_USER_ID, displayName: 'Mock Mentor', email: 'mentor@devmentor.test' },
    },
    lengthMinutes: 25,
    startsAt: new Date('2026-09-16T09:00:00.000Z'),
  } as unknown as IBooking;
}

function notification(overrides: Partial<INotification> = {}): INotification {
  return {
    id: 'notification-1',
    user: { id: MENTEE_ID },
    booking: { id: BOOKING_ID },
    kind: 'booking_confirmed',
    createdAt: NOW,
    readAt: null,
    ...overrides,
  } as unknown as INotification;
}

function makeHarness({
  session = { userId: MENTEE_ID, roles: ['mentee'] } as Session | null | Promise<Session | null>,
  stored = booking() as IBooking | null,
  notifications = [] as INotification[],
  storedNotification = notification() as INotification | null,
  sendFails = false,
}: {
  session?: Session | null | Promise<Session | null>;
  stored?: IBooking | null;
  notifications?: INotification[];
  storedNotification?: INotification | null;
  sendFails?: boolean;
} = {}) {
  const created: Record<string, unknown>[] = [];
  const em = {
    findOne: vi.fn(async (entity: unknown) => (entity === Booking ? stored : storedNotification)),
    find: vi.fn(async () => notifications),
    create: vi.fn((_entity: unknown, data: Record<string, unknown>) => {
      created.push(data);
      return data;
    }),
    persist: vi.fn(),
    flush: vi.fn(async () => undefined),
  };
  const mailer = {
    send: vi.fn(async (_message: MailMessage) => {
      if (sendFails) throw new Error('provider rejected the message');
    }),
  };
  const logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() } as unknown as Logger;
  const service = new NotificationService({
    em: em as unknown as EntityManager,
    clock: { now: () => NOW },
    env: { APP_URL } as AppEnv,
    logger,
    mailer,
    session: session instanceof Promise ? session : Promise.resolve(session),
  });
  return { service, em, mailer, logger, created };
}

beforeEach(() => vi.clearAllMocks());

describe('notification projection', () => {
  it('carries the kind, its booking and whether it has been read', () => {
    expect(toNotificationDto(notification())).toEqual({
      id: 'notification-1',
      kind: 'booking_confirmed',
      bookingId: BOOKING_ID,
      createdAt: NOW.toISOString(),
      readAt: null,
    });
  });

  it('reports an absent booking and a read instant as their own values', () => {
    const dto = toNotificationDto(notification({ booking: null, readAt: NOW } as never));

    expect(dto.bookingId).toBeNull();
    expect(dto.readAt).toBe(NOW.toISOString());
  });
});

describe('NotificationService.onBookingConfirmed', () => {
  it('tells both parties, each in their own message', async () => {
    const h = makeHarness();

    await h.service.onBookingConfirmed(BOOKING_ID);

    expect(h.created).toHaveLength(2);
    expect(h.created.map((row) => (row.user as { id: string }).id))
      .toEqual([MENTOR_USER_ID, MENTEE_ID]);
    expect(h.created.every((row) => row.kind === 'booking_confirmed' && row.readAt === null))
      .toBe(true);

    expect(h.mailer.send).toHaveBeenCalledTimes(2);
    expect(h.mailer.send).toHaveBeenNthCalledWith(1, {
      to: 'mentor@devmentor.test',
      subject: 'Ada Lovelace booked a session with you',
      text: expect.stringContaining('2026-09-16T09:00:00.000Z (25 minutes)'),
    });
    expect(h.mailer.send).toHaveBeenNthCalledWith(2, {
      to: 'ada@devmentor.test',
      subject: 'Your session with Mock Mentor is confirmed',
      text: expect.stringContaining('2026-09-16T09:00:00.000Z (25 minutes)'),
    });
  });

  it('points each party at their own sessions list', async () => {
    const h = makeHarness();

    await h.service.onBookingConfirmed(BOOKING_ID);

    const [toMentor, toMentee] = h.mailer.send.mock.calls.map(([message]) => message.text);
    expect(toMentor).toContain(`${APP_URL}/mentor/sessions`);
    expect(toMentee).toContain(`${APP_URL}/home`);
    expect(toMentee).not.toContain('/mentor/sessions');
  });

  it('writes the record before it tries the email', async () => {
    const h = makeHarness();

    await h.service.onBookingConfirmed(BOOKING_ID);

    // A mailer outage must cost the courtesy, not the record.
    expect(h.em.flush.mock.invocationCallOrder[0]!)
      .toBeLessThan(h.mailer.send.mock.invocationCallOrder[0]!);
  });

  it('keeps both records when the mailer is down, and says so once per message', async () => {
    const h = makeHarness({ sendFails: true });

    await expect(h.service.onBookingConfirmed(BOOKING_ID)).resolves.toBeUndefined();

    expect(h.created).toHaveLength(2);
    expect(h.logger.warn).toHaveBeenCalledTimes(2);
    expect(h.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ bookingId: BOOKING_ID, kind: 'booking_confirmed' }),
      'notification email could not be delivered',
    );
  });

  it('says nothing about a booking that vanished before the handler ran', async () => {
    const h = makeHarness({ stored: null });

    await expect(h.service.onBookingConfirmed(BOOKING_ID)).resolves.toBeUndefined();

    expect(h.created).toHaveLength(0);
    expect(h.mailer.send).not.toHaveBeenCalled();
    expect(h.logger.warn).toHaveBeenCalledWith(
      { bookingId: BOOKING_ID },
      'confirmed booking vanished before notification',
    );
  });
});

describe('NotificationService.listMine', () => {
  it('answers from the session, never from a parameter', async () => {
    const h = makeHarness({ notifications: [notification()] });

    await expect(h.service.listMine()).resolves.toEqual([toNotificationDto(notification())]);

    expect(h.em.find).toHaveBeenCalledExactlyOnceWith(
      Notification,
      { user: MENTEE_ID },
      { orderBy: { createdAt: 'desc' }, limit: 50 },
    );
  });

  it('refuses a caller with no session', async () => {
    await expect(makeHarness({ session: null }).service.listMine()).rejects
      .toThrow(UnauthorizedError);
  });

  it('surfaces a session that could not be resolved without leaving it unhandled', async () => {
    const failure = new Error('session store unreachable');

    // The constructor attaches its own catch, so an unawaited rejection cannot crash the
    // process; the read still reports the failure to its caller.
    await expect(makeHarness({ session: Promise.reject(failure) }).service.listMine())
      .rejects.toBe(failure);
  });
});

describe('NotificationService.markRead', () => {
  it('stamps an unread notification the caller owns', async () => {
    const stored = notification();
    const h = makeHarness({ storedNotification: stored });

    await expect(h.service.markRead('notification-1')).resolves.toMatchObject({
      readAt: NOW.toISOString(),
    });
    expect(h.em.flush).toHaveBeenCalledOnce();
  });

  it('leaves an already-read notification at its first instant', async () => {
    const first = new Date('2026-09-13T08:00:00.000Z');
    const h = makeHarness({ storedNotification: notification({ readAt: first } as never) });

    await expect(h.service.markRead('notification-1')).resolves.toMatchObject({
      readAt: first.toISOString(),
    });
  });

  it('refuses somebody else notification', async () => {
    const h = makeHarness({
      storedNotification: notification({ user: { id: 'someone-else' } } as never),
    });

    await expect(h.service.markRead('notification-1')).rejects.toThrow(ForbiddenError);
  });

  it('refuses an unknown notification, and a caller with no session', async () => {
    await expect(makeHarness({ storedNotification: null }).service.markRead('x')).rejects
      .toThrow(NotFoundError);
    await expect(makeHarness({ session: null }).service.markRead('x')).rejects
      .toThrow(UnauthorizedError);
  });
});
