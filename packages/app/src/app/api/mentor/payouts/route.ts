import { ownedAction, type PayoutDto } from '@devmentor/core';

export const dynamic = 'force-dynamic';

/**
 * A mentor's own payouts (#25). Scoped through the session, so there is no mentor id in the
 * request for anyone to change.
 */
export const GET = ownedAction<PayoutDto[]>({
  role: 'mentor',
  run: (_req, { payoutService }) => payoutService.listForMentor(),
});
