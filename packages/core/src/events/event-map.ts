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
}

export type EventId = keyof EventMap;
