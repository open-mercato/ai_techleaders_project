import { ownedAction, type SessionViewDto } from '@devmentor/core';
import { requireBookingId } from '../booking-id';

export const dynamic = 'force-dynamic';

/**
 * One confirmed booking's text session, for one of its two parties (#26).
 *
 * **No `role`.** Both sides of a booking open the same screen, so "mentee or mentor" is not a
 * role check but a party check, and the party is decided by `TextSessionService` against the
 * booking's own two user ids. A role here would either refuse the mentor or let in every
 * mentee in the product.
 *
 * The window state travels in the response rather than being recomputed in the browser: a
 * browser's clock is a setting, and this is the answer that decides whether a message may be
 * posted at all.
 */
export const GET = ownedAction<SessionViewDto>({
  // `async` so a missing id in the path is a rejected promise rather than a synchronous
  // throw: `apiHandler` maps one code path, and every other route here reads the same way.
  run: async (_req, { textSessionService }, params) =>
    textSessionService.getForParty(requireBookingId(params)),
});
