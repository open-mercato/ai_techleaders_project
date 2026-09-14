import { SessionsList } from '../../../components/sessions-list';
import { UnreadNotifications } from '../../../components/unread-notifications';
import { requirePageRole } from '../../../lib/session';
import { BookedBanner } from './booked-banner';

/**
 * `/home` — where `homeFor` sends a mentee, and where their sessions live. Named `/home`
 * because #12 names it; the mentor's `/mentor` is deliberately spelled differently (#15 and
 * #17 already write it that way).
 *
 * The guard runs **here** as well as in the layout above, and that repetition is the point:
 * a layout does not re-render when the router fetches this segment on a client-side
 * navigation, so a page that trusted its layout would serve itself to a session that no
 * longer holds the role (edge case 21). `redirect()` throws, so nothing below it renders for
 * a caller who fails the check.
 *
 * `?booked=<id>` is what a mentee carries back from a hosted payment. It is a hint for the
 * banner and nothing more — the list itself is fetched fresh, so a fabricated id changes
 * what the banner says and not what anybody has.
 */

// The guard reads the session cookie and reloads the user; never prerendered.
export const dynamic = 'force-dynamic';

export default async function MenteeHomePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requirePageRole('mentee', '/home');
  const booked = (await searchParams)?.booked;

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">My sessions</h1>
      <UnreadNotifications as="mentee" />
      <SessionsList
        as="mentee"
        emptyTitle="No sessions yet"
        emptyDescription="Find a mentor, choose a time, and your sessions will be listed here."
        banner={booked === undefined ? undefined : <BookedBanner />}
      />
    </div>
  );
}
