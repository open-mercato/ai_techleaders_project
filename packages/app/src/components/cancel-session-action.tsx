'use client';

import { useState } from 'react';
import type { CancelledBookingDto, SessionListItemDto } from '@devmentor/core';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Button,
  CancellationSummary,
  priceLabel,
} from '@devmentor/ui';
import { apiCall, ErrorMessage } from '@devmentor/ui/backend';

export interface CancelSessionActionProps {
  session: SessionListItemDto;
  /** Called once the cancellation landed, so the list can re-read itself. */
  onCancelled: () => void;
}

/**
 * The outcome a mentee is shown **before** they confirm (R09).
 *
 * `refundOnCancel` is the server's answer, read when the list loaded — not a calculation
 * from the browser's clock, which is a setting. The server decides again at cancellation,
 * and the response says what actually happened.
 */
export function cancellationConsequence(session: SessionListItemDto): string {
  return session.refundOnCancel
    ? 'You are cancelling more than 24 hours before the session, so the full amount is refunded.'
    : 'You are cancelling less than 24 hours before the session, so the fee is not refunded. '
      + 'The time is freed for someone else either way.';
}

/**
 * The rule itself, for the slot beside the amounts.
 *
 * The dialog's description already states what happens to *this* booking; repeating that
 * sentence inside the summary put the same words on the screen twice. This says the rule
 * the outcome came from instead, which is the thing the amounts need explaining by.
 */
const CANCELLATION_RULE =
  'Cancelling more than 24 hours before a session refunds the fee in full. Later than that, '
  + 'the fee is not refunded.';

/**
 * Cancel a paid session, with the rule stated before the mentee commits to it (#24).
 *
 * The dialog is not a courtesy: R09 requires the screen to say what happens to the money
 * *before* the confirmation, because "cancel" and "cancel and lose your fee" are different
 * decisions and only one of them is the one being offered.
 */
export function CancelSessionAction({ session, onCancelled }: CancelSessionActionProps) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const paid = priceLabel(session.priceCents, session.currency);

  async function cancel() {
    setSubmitting(true);
    setFailure(null);
    const result = await apiCall<CancelledBookingDto>(
      `/api/bookings/${encodeURIComponent(session.id)}/cancel`,
      { method: 'POST' },
    );
    setSubmitting(false);
    if (!result.ok) {
      setFailure(result.error.message);
      return;
    }
    setOpen(false);
    onCancelled();
  }

  return <AlertDialog open={open} onOpenChange={setOpen}>
    <AlertDialogTrigger asChild>
      <Button type="button" intent="error" appearance="stroke" size="sm">Cancel session</Button>
    </AlertDialogTrigger>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Cancel this session?</AlertDialogTitle>
        <AlertDialogDescription>
          {cancellationConsequence(session)}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <CancellationSummary
        sessionLabel={`${session.lengthMinutes}-minute text session with ${session.counterpartName}`}
        paid={paid}
        refund={session.refundOnCancel ? paid : priceLabel(0, session.currency)}
        consequence={CANCELLATION_RULE}
        actions={null}
      />
      {failure === null ? null : <ErrorMessage message={failure} />}
      <AlertDialogFooter>
        <AlertDialogCancel disabled={submitting}>Keep the session</AlertDialogCancel>
        <AlertDialogAction
          disabled={submitting}
          aria-busy={submitting}
          onClick={(event) => {
            // The dialog closes on its own action; it must stay open until the request
            // answers, or a refusal would be dismissed along with the screen showing it.
            event.preventDefault();
            void cancel();
          }}
        >
          {submitting ? 'Cancelling…' : 'Cancel session'}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>;
}
