import {
  ForbiddenError,
  bookingCreateSchema,
  makeOwnedCollectionRoute,
  ownedAction,
  type BookingCreateInput,
  type BookingDto,
  type Role,
  type SessionListItemDto,
} from '@devmentor/core';

export const dynamic = 'force-dynamic';

/**
 * Reserve a slot (#21). Mentee only, and the owned-route wrapper resolves the caller's
 * session — **no user id is ever read from the request**, so there is nothing to tamper
 * with. `apiHandler` enforces the CSRF header for the mutating verb.
 */
export const { POST } = makeOwnedCollectionRoute<BookingDto, BookingCreateInput>({
  role: 'mentee',
  create: (_req, { bookingService }, _params, input) => bookingService.start(input),
  createSchema: bookingCreateSchema,
});

/**
 * A caller's own sessions (#23).
 *
 * **Which list you get is decided by the roles on your session, not by anything you send.**
 * There is no `userId` parameter and there never will be: the two lists differ only in
 * which side of the booking the caller is on, so an id here would be an authorization
 * decision made by the client.
 *
 * `?as=mentor` exists for the one genuinely ambiguous case — somebody who is both a mentee
 * and a mentor. It selects *between the caller's own roles* and is refused for a role they
 * do not hold, so it widens nothing. Without it, a dual-role caller gets the mentee view,
 * because that is the one every account can have.
 */
export const GET = ownedAction<SessionListItemDto[]>({
  run: async (req, { bookingService, session }) => {
    const roles: readonly Role[] = (await session)?.roles ?? [];
    const requested = new URL(req.url).searchParams.get('as');

    if (requested !== null && requested !== 'mentor' && requested !== 'mentee') {
      throw new ForbiddenError('Ask for your sessions as a mentee or as a mentor.');
    }
    const as = requested ?? (roles.includes('mentee') ? 'mentee' : 'mentor');
    if (!roles.includes(as)) throw new ForbiddenError();

    return as === 'mentor' ? bookingService.listForMentor() : bookingService.listForMentee();
  },
});
