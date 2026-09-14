import {
  makeOwnedCollectionRoute,
  notificationReadSchema,
  type NotificationDto,
  type NotificationReadInput,
} from '@devmentor/core';

export const dynamic = 'force-dynamic';

/**
 * A caller's own notifications (#23).
 *
 * No role: every signed-in person has notifications, and which ones is decided by the
 * session rather than by anything the caller sends. `POST` marks one read — a mutation, so
 * `apiHandler` requires the CSRF header — and is idempotent, because a client that marks
 * the same notification twice has not done anything wrong.
 */
export const { GET, POST } = makeOwnedCollectionRoute<NotificationDto, NotificationReadInput>({
  list: (_req, { notificationService }) => notificationService.listMine(),
  create: (_req, { notificationService }, _params, input) =>
    notificationService.markRead(input.id),
  createSchema: notificationReadSchema,
});
