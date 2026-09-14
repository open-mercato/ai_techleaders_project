import { ownedAction, type PayoutRunSummary } from '@devmentor/core';

export const dynamic = 'force-dynamic';

/**
 * Run the due payouts (#25). Operator only.
 *
 * **A by-hand operator action, logged (R18).** There is no scheduler in this project, so
 * somebody decides when mentors get paid; the log line is what makes that decision
 * attributable afterwards. The run itself is idempotent — one payout per session, enforced
 * by a unique index — so triggering it twice is safe and a double click is not an incident.
 */
export const POST = ownedAction<PayoutRunSummary>({
  role: 'operator',
  run: async (_req, { payoutService, logger, session }) => {
    const summary = await payoutService.runDue();
    logger.info(
      { operatorId: (await session)?.userId, ...summary },
      'operator ran due payouts',
    );
    return summary;
  },
});
