import {
  Booking,
  MAX_MESSAGE_LENGTH,
  SessionMessage,
  type EntityManager,
  type IBooking,
  type ISessionMessage,
} from '@devmentor/db';
import type { Session } from '../../http/auth';
import { ConflictError, ForbiddenError, NotFoundError, UnauthorizedError } from '../../http/errors';
import type { Clock } from '../../time/clock';
import type { MessageCreateInput } from '../../validators/sessions/message-create.schema';

/**
 * How many messages one session keeps.
 *
 * Not a throttle — an integrity bound. A 25- or 50-minute text session does not reach 500
 * messages between two people, and an unbounded table behind an authenticated loop is not
 * something to ship. It is also the read limit, so the transcript cannot grow past what one
 * response can carry.
 */
export const MAX_SESSION_MESSAGES = 500;

export const SESSION_NOT_FOUND_MESSAGE = 'This session does not exist.';
export const SESSION_NOT_A_PARTY_MESSAGE =
  'This session belongs to the mentee and the mentor who booked it.';
export const SESSION_NOT_STARTED_MESSAGE = 'This session has not started yet.';
export const SESSION_ENDED_MESSAGE =
  "This session has ended. The mentor's written answer comes next.";
export const SESSION_FULL_MESSAGE =
  'This session has reached its message limit. Continue in the written answer.';

/** `not_started` before the slot's start, `open` during the booked length, `ended` after it. */
export type SessionWindowState = 'not_started' | 'open' | 'ended';

export interface SessionWindow {
  state: SessionWindowState;
  startsAt: string;
  endsAt: string;
}

export interface SessionMessageDto {
  id: string;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
}

/**
 * One session as its own party sees it (#26).
 *
 * `viewerUserId` is here so the browser can mark the caller's own messages without guessing
 * from a display name — two people called Alex in one session would otherwise swap sides.
 *
 * `maxMessageLength` travels with the session rather than being declared in the browser, so
 * the count a party reads is the bound the route actually enforces.
 */
export interface SessionViewDto {
  bookingId: string;
  viewerUserId: string;
  counterpartName: string;
  lengthMinutes: number;
  window: SessionWindow;
  messages: SessionMessageDto[];
  maxMessageLength: number;
}

/**
 * The window, from the booking and a clock — nothing else can answer it (R01, D01).
 *
 * Both boundaries are the same decision twice: **the named instant belongs to the state it
 * opens.** At exactly `startsAt` the session is `open`, because that is the minute the mentee
 * paid for and a screen that still said "not started" at the time printed on it would be
 * wrong about the product's own promise. At exactly `endsAt` it is `ended`, because 25 minutes
 * must not mean 25 minutes and a tick.
 */
export function sessionWindow(booking: IBooking, now: Date): SessionWindow {
  const startsAt = booking.startsAt.getTime();
  const endsAt = startsAt + booking.lengthMinutes * 60_000;
  const at = now.getTime();
  const state: SessionWindowState = at < startsAt
    ? 'not_started'
    : at < endsAt
      ? 'open'
      : 'ended';
  return {
    state,
    startsAt: booking.startsAt.toISOString(),
    endsAt: new Date(endsAt).toISOString(),
  };
}

function toMessageDto(message: ISessionMessage): SessionMessageDto {
  return {
    id: message.id,
    authorId: message.author.id,
    authorName: message.author.displayName,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
  };
}

/**
 * The text session of a confirmed booking (#26).
 *
 * **Named `TextSession` and not `Session`.** `SessionService` is already taken, by the auth
 * service that issues and verifies the sign-in cookie, and the two would sit on the same
 * `Cradle` under one name. "Text session" is also what the product calls this (R03), so the
 * longer name is the product's word rather than a suffix invented to dodge a clash.
 *
 * **This service is the party authority.** The route guard only proves that somebody is
 * signed in — it cannot ask the role question, because both sides of one booking use the same
 * screen and "mentee or mentor" is not a role check but a *party* check (B3/B4). So every
 * entry point here resolves the caller's own session and compares it against the two user ids
 * on the booking. An operator is refused like anyone else: E05's dispute resolution (#32) is
 * not this screen, and a private exchange the platform can read by holding a role is not the
 * private exchange the brief describes.
 */
export class TextSessionService {
  private readonly em: EntityManager;
  private readonly clock: Clock;
  private readonly session: Promise<Session | null>;

  constructor({
    em,
    clock,
    session,
  }: {
    em: EntityManager;
    clock: Clock;
    session: Promise<Session | null>;
  }) {
    this.em = em;
    this.clock = clock;
    this.session = session;
    void session.catch(() => undefined);
  }

  private async signedIn(): Promise<Session> {
    const session = await this.session;
    if (session === null) throw new UnauthorizedError();
    return session;
  }

  /**
   * The booking behind a session, for a caller who is one of its two parties.
   *
   * A booking that is not `confirmed` has no session **and says so as a 404**: an unpaid hold
   * is not a session anybody has, and a cancelled one is not a session to reopen. A caller who
   * is not a party gets a **403** instead, and the difference is deliberate — a 404 there would
   * be indistinguishable from the not-confirmed case above, which is the one message a real
   * party needs to be able to tell apart from "you cannot see this".
   */
  private async party(bookingId: string): Promise<{ session: Session; booking: IBooking }> {
    const session = await this.signedIn();
    const booking = await this.em.findOne(
      Booking,
      { id: bookingId },
      { populate: ['mentee', 'mentorProfile', 'mentorProfile.user'] },
    );
    if (booking === null || booking.status !== 'confirmed') {
      throw new NotFoundError(SESSION_NOT_FOUND_MESSAGE);
    }
    const parties = [booking.mentee.id, booking.mentorProfile.user.id];
    if (!parties.includes(session.userId)) {
      throw new ForbiddenError(SESSION_NOT_A_PARTY_MESSAGE);
    }
    return { session, booking };
  }

  async getForParty(bookingId: string): Promise<SessionViewDto> {
    const { session, booking } = await this.party(bookingId);
    const messages = await this.em.find(
      SessionMessage,
      { booking: booking.id },
      {
        populate: ['author'],
        // `createdAt` and not `id`: the ids are uuid v4 and do not sort by creation time.
        // `id` is the tiebreaker so two messages in the same millisecond keep a stable order
        // across polls rather than swapping places under the reader.
        orderBy: { createdAt: 'asc', id: 'asc' },
        limit: MAX_SESSION_MESSAGES,
      },
    );
    const isMentee = session.userId === booking.mentee.id;
    return {
      bookingId: booking.id,
      viewerUserId: session.userId,
      counterpartName: isMentee
        ? booking.mentorProfile.user.displayName
        : booking.mentee.displayName,
      lengthMinutes: booking.lengthMinutes,
      window: sessionWindow(booking, this.clock.now()),
      messages: messages.map(toMessageDto),
      maxMessageLength: MAX_MESSAGE_LENGTH,
    };
  }

  /**
   * Post one message, only while the window is open.
   *
   * `409` and not `422`: the body is valid, the moment is wrong. The clock is read here rather
   * than trusted from the read that drew the screen, so a tab left open across the end
   * boundary cannot post through it and a post that races the boundary is decided by the
   * server.
   */
  async postMessage(bookingId: string, input: MessageCreateInput): Promise<SessionMessageDto> {
    const { session, booking } = await this.party(bookingId);
    const { state } = sessionWindow(booking, this.clock.now());
    if (state === 'not_started') throw new ConflictError(SESSION_NOT_STARTED_MESSAGE);
    if (state === 'ended') throw new ConflictError(SESSION_ENDED_MESSAGE);

    const stored = await this.em.count(SessionMessage, { booking: booking.id });
    if (stored >= MAX_SESSION_MESSAGES) throw new ConflictError(SESSION_FULL_MESSAGE);

    // The author is one of the two parties and both are already loaded, so this is the
    // loaded row rather than a reference — `toMessageDto` reads `displayName` off it, and a
    // reference would answer that with `undefined` and put a nameless message on the screen.
    const author = session.userId === booking.mentee.id
      ? booking.mentee
      : booking.mentorProfile.user;
    const message = this.em.create(SessionMessage, { booking, author, body: input.body });
    this.em.persist(message);
    await this.em.flush();
    return toMessageDto(message);
  }
}
