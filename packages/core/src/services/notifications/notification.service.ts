import {
  Booking,
  Notification,
  type EntityManager,
  type IBooking,
  type INotification,
  type IUser,
  type NotificationKind,
} from '@devmentor/db';
import type { AppEnv } from '../../config/env';
import type { Logger } from '../../logger';
import { assertOwnership, type Session } from '../../http/auth';
import { NotFoundError, UnauthorizedError } from '../../http/errors';
import type { Clock } from '../../time/clock';
import type { Mailer } from './mailer.port';

export interface NotificationDto {
  id: string;
  kind: NotificationKind;
  bookingId: string | null;
  createdAt: string;
  readAt: string | null;
}

export function toNotificationDto(notification: INotification): NotificationDto {
  return {
    id: notification.id,
    kind: notification.kind,
    bookingId: notification.booking?.id ?? null,
    createdAt: notification.createdAt.toISOString(),
    readAt: notification.readAt?.toISOString() ?? null,
  };
}

/** A `<time>`-friendly instant plus the length, which is all either party needs to act. */
function whenAndHowLong(booking: IBooking): string {
  return `${booking.startsAt.toISOString()} (${booking.lengthMinutes} minutes)`;
}

export class NotificationService {
  private readonly em: EntityManager;
  private readonly clock: Clock;
  private readonly env: AppEnv;
  private readonly logger: Logger;
  private readonly mailer: Mailer;
  private readonly session: Promise<Session | null>;

  constructor({
    em,
    clock,
    env,
    logger,
    mailer,
    session,
  }: {
    em: EntityManager;
    clock: Clock;
    env: AppEnv;
    logger: Logger;
    mailer: Mailer;
    session: Promise<Session | null>;
  }) {
    // Destructure the PROXY cradle synchronously — resolving a key after an await can reach
    // a request scope that has already been disposed.
    this.em = em;
    this.clock = clock;
    this.env = env;
    this.logger = logger;
    this.mailer = mailer;
    this.session = session;
    void session.catch(() => undefined);
  }

  private async requireSession(): Promise<Session> {
    const session = await this.session;
    if (session === null) throw new UnauthorizedError();
    return session;
  }

  /**
   * Tell both parties a booking is real (#23).
   *
   * **The row is written first and the mail is sent after, and a failed send is logged
   * rather than thrown.** The event bus swallows a failing handler anyway, so throwing here
   * would only lose the notification as well as the email; writing first means a mailer
   * outage costs the courtesy and not the record. Whoever opens their sessions sees the
   * booking either way.
   *
   * Nothing subscribes to a pending or expired booking, so an unconfirmed reservation
   * notifies nobody — that is a property of the event, not a check here.
   */
  async onBookingConfirmed(bookingId: string): Promise<void> {
    const booking = await this.em.findOne(
      Booking,
      { id: bookingId },
      { populate: ['mentee', 'mentorProfile', 'mentorProfile.user'] },
    );
    if (booking === null) {
      // The booking was deleted between the commit and this handler. Nothing to say, and
      // nothing that a retry would fix.
      this.logger.warn({ bookingId }, 'confirmed booking vanished before notification');
      return;
    }

    const mentor = booking.mentorProfile.user;
    const mentee = booking.mentee;
    await this.tell(booking, 'booking_confirmed', mentor, {
      subject: `${mentee.displayName} booked a session with you`,
      text:
        `${mentee.displayName} booked a text session with you.\n`
        + `When: ${whenAndHowLong(booking)}\n`
        + `Your sessions: ${this.env.APP_URL}/mentor/sessions\n`,
    });
    await this.tell(booking, 'booking_confirmed', mentee, {
      subject: `Your session with ${mentor.displayName} is confirmed`,
      text:
        `Your text session with ${mentor.displayName} is confirmed.\n`
        + `When: ${whenAndHowLong(booking)}\n`
        + `Your sessions: ${this.env.APP_URL}/home\n`,
    });
  }

  /** Write the durable record, then try the email. Order is the point. */
  private async tell(
    booking: IBooking,
    kind: NotificationKind,
    recipient: IUser,
    message: { subject: string; text: string },
  ): Promise<void> {
    const notification = this.em.create(Notification, {
      user: recipient,
      booking,
      kind,
      readAt: null,
    });
    this.em.persist(notification);
    await this.em.flush();

    try {
      await this.mailer.send({ to: recipient.email, ...message });
    } catch (error) {
      // Best-effort by design (B15): the row above is what the product relies on.
      this.logger.warn(
        { err: error, bookingId: booking.id, userId: recipient.id, kind },
        'notification email could not be delivered',
      );
    }
  }

  /** The caller's own notifications, newest first. No user id is ever read from a request. */
  async listMine(): Promise<NotificationDto[]> {
    const session = await this.requireSession();
    const notifications = await this.em.find(
      Notification,
      { user: session.userId },
      { orderBy: { createdAt: 'desc' }, limit: 50 },
    );
    return notifications.map(toNotificationDto);
  }

  /** Mark one of the caller's own notifications read. Idempotent. */
  async markRead(notificationId: string): Promise<NotificationDto> {
    const session = await this.requireSession();
    const notification = await this.em.findOne(
      Notification,
      { id: notificationId },
      { populate: ['user', 'booking'] },
    );
    if (notification === null) throw new NotFoundError('That notification does not exist.');
    assertOwnership(session, notification.user.id);

    notification.readAt ??= this.clock.now();
    await this.em.flush();
    return toNotificationDto(notification);
  }
}
