import { defineEntity, type InferEntity } from '@mikro-orm/core';
import { baseProperties } from '../base.entity';
import { defineSingletonEntity } from '../define';
import { Booking } from '../bookings/booking.entity';
import { User } from '../auth/user.entity';
import { NOTIFICATION_KINDS } from './notification-kind';

const p = defineEntity.properties;

/**
 * One thing one person needs to know, kept in the product.
 *
 * **This row is the durable record; the email beside it is a courtesy.** The event bus is
 * in-process and swallows a failing handler, so a mailer outage must not be able to make a
 * booking invisible to the person it belongs to. Whoever reads their notifications sees it
 * either way.
 *
 * `booking` is nullable because a later kind may not be about one; `readAt` is nullable
 * because unread is the normal state, and `(user, readAt)` is indexed because "my unread
 * notifications" is the only query this table has.
 *
 * The relations `cascade`, unlike `Booking`'s: a notification is a message about a record,
 * not the record. Deleting the booking it points at should take it, and leaving a dangling
 * message behind would be worse than losing it.
 */
export const Notification = defineSingletonEntity('Notification', () =>
  defineEntity({
    name: 'Notification',
    tableName: 'notifications',
    properties: {
      ...baseProperties,
      // Per-property thunks so the cross-entity references resolve lazily at discovery time.
      user: () => p.manyToOne(User).deleteRule('cascade'),
      booking: () => p.manyToOne(Booking).nullable().deleteRule('cascade'),
      kind: p.enum(NOTIFICATION_KINDS),
      readAt: p.datetime().nullable(),
    },
    indexes: [{ name: 'notifications_user_read_at_index', properties: ['user', 'readAt'] }],
  }),
);

export type INotification = InferEntity<typeof Notification>;
