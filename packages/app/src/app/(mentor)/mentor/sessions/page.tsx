import { SessionsList } from '../../../../components/sessions-list';
import { requirePageRole } from '../../../../lib/session';

/**
 * `/mentor/sessions` — the sessions booked with the signed-in mentor (#23).
 *
 * The guard runs here as well as in the layout above, for the reason every guarded page in
 * this app repeats it: a layout does not re-render when the router fetches this segment on
 * a client-side navigation (edge case 21).
 *
 * Scoping is the route's and the service's job, not this page's: `GET /api/bookings`
 * answers from the caller's own session, so there is no mentor id here to get wrong.
 */

export const dynamic = 'force-dynamic';

export default async function MentorSessionsPage() {
  await requirePageRole('mentor', '/mentor/sessions');

  return <div className="flex flex-col gap-6">
    <header className="max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Booked sessions</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Sessions mentees have booked and paid for with you.
      </p>
    </header>
    <SessionsList
      as="mentor"
      emptyTitle="No sessions booked yet"
      emptyDescription="A session appears here once a mentee has booked one of your times and paid for it."
    />
  </div>;
}
