import { withScope, type PayoutRunSummary } from '@devmentor/core';

/**
 * Run the due payouts from a terminal (#25, R18).
 *
 * The founders' half of the same action the operator screen offers. There is no scheduler
 * in this project, so somebody decides when mentors get paid; this exists so that decision
 * does not require a browser — during an incident, or before the operator screen exists in
 * whatever environment needs it.
 *
 * Safe to run twice: one payout per session is enforced by a unique index, so a second run
 * finds nothing due rather than paying anybody again.
 */
export async function main(): Promise<PayoutRunSummary> {
  const summary = await withScope(({ payoutService }) => payoutService.runDue());
  process.stdout.write(
    `payouts: ${summary.transferred} transferred, ${summary.held} held, `
    + `${summary.failed} failed\n`,
  );
  return summary;
}
