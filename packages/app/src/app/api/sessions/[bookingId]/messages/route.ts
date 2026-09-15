import {
  makeOwnedCollectionRoute,
  messageCreateSchema,
  type MessageCreateInput,
  type SessionMessageDto,
} from '@devmentor/core';
import { requireBookingId } from '../../booking-id';

export const dynamic = 'force-dynamic';

/**
 * Post one message into a text session (#26).
 *
 * **Only `POST` is destructured**, so this address has no `GET`: the transcript is read
 * through `GET /api/sessions/{bookingId}`, and a second read path for the same rows would be
 * a second contract to keep in step. Next answers the other verbs with 405 on its own.
 *
 * No `role`, for the same reason the session's own route has none — the party check belongs to
 * the service. `apiHandler` requires the CSRF header because this is a mutation, and the
 * schema is the boundary's only job: whether the session is *open* is server-time policy and
 * the service reads the clock for it.
 */
export const { POST } = makeOwnedCollectionRoute<SessionMessageDto, MessageCreateInput>({
  // `async` so a missing id in the path is a rejected promise rather than a synchronous throw.
  create: async (_req, { textSessionService }, params, input) =>
    textSessionService.postMessage(requireBookingId(params), input),
  createSchema: messageCreateSchema,
});
