import { NotFoundError, SESSION_NOT_FOUND_MESSAGE, type OwnedRouteParams } from '@devmentor/core';

/**
 * The booking id in `/api/sessions/[bookingId]/…`, or a 404.
 *
 * Shared by the session's two routes so the same address shape cannot answer one of them and
 * not the other. It refuses with `SESSION_NOT_FOUND_MESSAGE` — the same sentence the service
 * uses for a booking that exists but has no session — because a caller cannot act on the
 * difference between "no id in the path" and "no session at that id", and two different
 * messages for one outcome is two things to keep in step.
 *
 * The array branch is the App Router's: a catch-all segment hands back `string[]`, and the
 * first element is the id.
 */
export function requireBookingId(params: OwnedRouteParams): string {
  const value = params?.bookingId;
  const id = Array.isArray(value) ? value[0] : value;
  if (id === undefined) throw new NotFoundError(SESSION_NOT_FOUND_MESSAGE);
  return id;
}
