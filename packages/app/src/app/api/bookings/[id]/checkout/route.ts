import { NotFoundError, ownedAction } from '@devmentor/core';

export const dynamic = 'force-dynamic';

/**
 * Open the hosted payment for a reservation (#22). Mentee only; the service is the
 * ownership authority and refuses a booking that belongs to someone else.
 *
 * It returns the URL rather than redirecting: this is a fetched route, not a navigated one,
 * so it answers the envelope and the browser does the navigating.
 */
export const POST = ownedAction({
  role: 'mentee',
  run: async (_req, { paymentService }, params) => {
    const value = params?.id;
    const id = Array.isArray(value) ? value[0] : value;
    if (id === undefined) throw new NotFoundError('That booking does not exist.');
    return paymentService.startCheckout(id);
  },
});
