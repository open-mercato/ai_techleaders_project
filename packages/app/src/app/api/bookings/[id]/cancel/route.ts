import { NotFoundError, ownedAction, type CancelledBookingDto } from '@devmentor/core';

export const dynamic = 'force-dynamic';

/**
 * Cancel a paid session (#24). Mentee only; the service is the ownership authority and the
 * one that applies the 24-hour rule.
 *
 * The response says what happened to the money — `refundStatus` and the amount — because
 * "cancelled" alone does not tell a mentee whether they were refunded, and that is the one
 * thing they will want to know.
 */
export const POST = ownedAction<CancelledBookingDto>({
  role: 'mentee',
  run: async (_req, { bookingService }, params) => {
    const value = params?.id;
    const id = Array.isArray(value) ? value[0] : value;
    if (id === undefined) throw new NotFoundError('That booking does not exist.');
    return bookingService.cancelByMentee(id);
  },
});
