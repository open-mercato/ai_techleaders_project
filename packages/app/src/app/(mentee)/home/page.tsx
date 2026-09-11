import { EmptyState } from '@devmentor/ui/backend';
import { requirePageRole } from '../../../lib/session';

/**
 * `/home` — where `homeFor` sends a mentee. Named `/home` because #12 names it; the mentor's
 * `/mentor` is deliberately spelled differently (#15 and #17 already write it that way).
 *
 * The guard runs **here** as well as in the layout above, and that repetition is the point:
 * a layout does not re-render when the router fetches this segment on a client-side
 * navigation, so a page that trusted its layout would serve itself to a session that no
 * longer holds the role (edge case 21). `redirect()` throws, so nothing below it renders for
 * a caller who fails the check.
 */

// The guard reads the session cookie and reloads the user; never prerendered.
export const dynamic = 'force-dynamic';

export default async function MenteeHomePage() {
  await requirePageRole('mentee', '/home');

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">My sessions</h1>
      <EmptyState
        title="No sessions yet"
        description="Booking a session is not available yet. Sessions you book will be listed here."
      />
    </div>
  );
}
