import { sessionsHomeFor } from '../../../lib/nav';
import { requirePageSession } from '../../../lib/session';
import { SessionScreen } from './session-screen';

/**
 * `/sessions/[bookingId]` — the 25- or 50-minute text session of a confirmed booking (#26).
 *
 * One address for both parties. The guard runs **here** as well as in the layout above, for
 * the reason every guarded page in this app repeats it: a layout does not re-render when the
 * router fetches this segment on a client-side navigation, so a page that trusted its layout
 * would serve itself to a session that no longer holds (edge case 21).
 *
 * It guards only that somebody is signed in. Whether that somebody is one of the two parties
 * is the service's answer, reached through `GET /api/sessions/{bookingId}` — one place, so the
 * page and the route cannot disagree about who may read a private exchange.
 *
 * Where Q18 lands is still open (founder A); this address is its plain reading.
 */

// The guard reads the session cookie and reloads the user; never prerendered.
export const dynamic = 'force-dynamic';

export default async function SessionPage({
  params,
}: {
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;
  const session = await requirePageSession(`/sessions/${bookingId}`);

  return <SessionScreen bookingId={bookingId} backHref={sessionsHomeFor(session.roles)} />;
}
