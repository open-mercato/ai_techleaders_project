'use client';

import { useState } from 'react';
import type { PayoutRunSummary } from '@devmentor/core';
import { Button } from '@devmentor/ui';
import { apiCall, ErrorMessage } from '@devmentor/ui/backend';

/** Read a run's result out in words rather than three numbers. */
export function payoutRunSummaryText(summary: PayoutRunSummary): string {
  if (summary.transferred + summary.held + summary.failed === 0) {
    return 'Nothing was due.';
  }
  return `${summary.transferred} transferred, ${summary.held} held, ${summary.failed} failed.`;
}

/**
 * The operator's half of paying mentors (#25, R18).
 *
 * There is no scheduler in this project, so somebody decides when mentors get paid. The
 * action is safe to press twice — one payout per session is enforced by a unique index — so
 * it is not guarded behind a confirmation it does not need; the server logs who ran it.
 */
export function RunPayouts() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  async function run() {
    setRunning(true);
    setFailure(null);
    setResult(null);
    const response = await apiCall<PayoutRunSummary>('/api/operator/payouts/run', {
      method: 'POST',
    });
    setRunning(false);
    if (response.ok) setResult(payoutRunSummaryText(response.data));
    else setFailure(response.error.message);
  }

  return <div className="flex flex-col gap-2 text-sm">
    <Button type="button" size="sm" disabled={running} aria-busy={running} onClick={() => void run()}>
      {running ? 'Running…' : 'Run payouts'}
    </Button>
    {result === null ? null : <p role="status">{result}</p>}
    {failure === null ? null : <ErrorMessage message={failure} />}
  </div>;
}
