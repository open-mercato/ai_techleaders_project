import {
  bookingCreateSchema,
  makeOwnedCollectionRoute,
  type BookingCreateInput,
  type BookingDto,
} from '@devmentor/core';

export const dynamic = 'force-dynamic';

/**
 * Reserve a slot (#21). Mentee only, and the owned-route wrapper resolves the caller's
 * session — **no user id is ever read from the request**, so there is nothing to tamper
 * with. `apiHandler` enforces the CSRF header for the mutating verb.
 *
 * Only `POST` is mounted for now. The role-scoped `GET` that lists a caller's own bookings
 * arrives with E03-S04 (#23).
 */
export const { POST } = makeOwnedCollectionRoute<BookingDto, BookingCreateInput>({
  role: 'mentee',
  create: (_req, { bookingService }, _params, input) => bookingService.start(input),
  createSchema: bookingCreateSchema,
});
