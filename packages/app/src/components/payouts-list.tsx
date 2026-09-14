'use client';

import type { PayoutDto } from '@devmentor/core';
import { Button, PayoutStatus, priceLabel } from '@devmentor/ui';
import { EmptyState, ErrorMessage, LoadingMessage, useApiResource } from '@devmentor/ui/backend';
import { useViewerTimeZone } from './sessions-list';

/** Why a payout has not been sent, in the mentor's own terms rather than the enum's. */
export function heldExplanation(payout: PayoutDto): string {
  if (payout.status === 'transferred') return 'Sent to your payout account.';
  if (payout.status === 'failed') {
    return 'The transfer did not go through. DevMentor will try again on the next run.';
  }
  if (payout.heldReason === 'connect_onboarding_incomplete') {
    // Setting the account up *is* the thing needed, and it is needed from them: saying
    // otherwise would leave a mentor waiting on DevMentor for money DevMentor cannot send.
    return 'Waiting for your payout account. Set it up to receive this and later payouts.';
  }
  return 'Waiting to be sent.';
}

/** `PayoutStatus` draws four states; a payout has three. `scheduled` is not one of ours. */
export function payoutCardState(payout: PayoutDto): 'held' | 'transferred' | 'failed' {
  if (payout.status === 'transferred') return 'transferred';
  if (payout.status === 'failed') return 'failed';
  return 'held';
}

/**
 * What a mentor is owed, and what has been sent (#25).
 *
 * Each row shows the session price, DevMentor's fee and the share, so the 20% is checkable
 * rather than asserted. A held payout is listed rather than hidden: money owed and not yet
 * sent is exactly what a mentor wants to see.
 */
export function PayoutsList() {
  const resource = useApiResource<PayoutDto[]>('/api/mentor/payouts');
  const timeZone = useViewerTimeZone();

  if (resource.loading) return <LoadingMessage message="Loading your payouts" />;
  if (resource.error !== undefined) {
    return <ErrorMessage
      message={resource.error}
      action={<Button intent="neutral" appearance="stroke" onClick={resource.reload}>Try again</Button>}
    />;
  }

  const payouts = resource.data ?? [];
  if (payouts.length === 0) {
    return <EmptyState
      title="No payouts yet"
      description="A payout appears here once a session you were booked for has finished."
    />;
  }

  const when = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return <div className="flex flex-col gap-3">
    {payouts.map((payout) => <PayoutStatus
      key={payout.id}
      state={payoutCardState(payout)}
      gross={priceLabel(payout.priceCents, payout.currency)}
      fee={priceLabel(payout.platformFeeCents, payout.currency)}
      net={priceLabel(payout.amountCents, payout.currency)}
      detail={`Session on ${when.format(new Date(payout.sessionStartsAt))}. ${heldExplanation(payout)}`}
    />)}
  </div>;
}
