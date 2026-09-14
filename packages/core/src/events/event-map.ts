import type { Role } from '@devmentor/db';

/**
 * Registry of domain events. Event IDs follow `concept.entity.action` (past tense);
 * the value type is the event's payload. Add an entry here when a concept needs to
 * emit — this is the single source of truth the typed `EventBus` is generic over.
 *
 * In-process only: these drive synchronous side effects (logging, sending a message,
 * cache invalidation). There is no queue or background worker in this project.
 */
export interface EventMap {
  'auth.user.created': { userId: string; email: string };
  /**
   * `users.roles` was rewritten. Emitted by the opportunistic operator reconciliation and
   * by `grantRole`/`revokeRole`; `reason` says which, because only the grant paths bump
   * `session_version` and a subscriber reading the log needs to tell them apart.
   *
   * **This is not an audit record.** E01 is explicit that R18's durable artifact is the
   * `OPERATOR_EMAILS` commit in a reviewed PR — attributable and permanent. This event is
   * in-process, its realistic subscriber writes a pino line to an ephemeral log, and it
   * exists to make the cache update *observable*, nothing more.
   */
  'auth.user.roles_changed': {
    userId: string;
    roles: readonly Role[];
    previousRoles: readonly Role[];
    reason: 'reconciled' | 'granted' | 'revoked';
  };
  'invitations.invitation.accepted': {
    invitationId: string;
    userId: string;
    publishDueAt: string;
  };
  'mentors.profile.published': {
    mentorProfileId: string;
    slug: string;
  };
  'availability.slot.published': {
    mentorProfileId: string;
    slotId: string;
    startsAt: string;
  };
  /**
   * A payment was verified and its booking became real.
   *
   * **Emitted only from the payment webhook**, after the confirming transaction commits —
   * never from the browser's return to `success_url`, which proves nothing. E03-S04's
   * notification service is its subscriber, and nothing subscribes to a pending or expired
   * booking, so an unconfirmed reservation notifies nobody.
   */
  'bookings.booking.confirmed': {
    bookingId: string;
    menteeId: string;
    mentorProfileId: string;
    startsAt: string;
    lengthMinutes: number;
  };
  /**
   * A mentee cancelled a confirmed booking (D10).
   *
   * Emitted **after** the cancelling transaction commits, and before the refund settles:
   * the slot is free either way, and the mentor needs to know that now rather than when a
   * payment provider gets round to answering. `refunded` says whether one was owed at all
   * — inside 24 hours the fee is forfeit (R09), which is a decision and not a failure.
   */
  'bookings.booking.cancelled': {
    bookingId: string;
    menteeId: string;
    mentorProfileId: string;
    startsAt: string;
    refunded: boolean;
  };
}

export type EventId = keyof EventMap;
