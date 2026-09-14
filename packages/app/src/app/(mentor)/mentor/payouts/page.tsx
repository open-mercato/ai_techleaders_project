import { PayoutsList } from '../../../../components/payouts-list';
import { requirePageRole } from '../../../../lib/session';

/**
 * `/mentor/payouts` — what a mentor is owed and what has been sent (#25).
 *
 * Guarded at the page as well as at the layout, for the reason every guarded page in this
 * app repeats it: a layout does not re-render when the router fetches this segment on a
 * client-side navigation.
 */

export const dynamic = 'force-dynamic';

export default async function MentorPayoutsPage() {
  await requirePageRole('mentor', '/mentor/payouts');

  return <div className="flex flex-col gap-6">
    <header className="max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Payouts</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Your share of each finished session, and where it got to. DevMentor keeps a platform
        fee from every paid session; the amounts below show both.
      </p>
    </header>
    <PayoutsList />
  </div>;
}
