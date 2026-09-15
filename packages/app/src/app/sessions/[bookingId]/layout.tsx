import type { ReactNode } from 'react';
import { WorkspaceShell } from '../../../components/workspace-shell';
import { requirePageSession } from '../../../lib/session';

/**
 * The chrome around a text session (#26).
 *
 * **No role guard, deliberately.** One screen serves both sides of a booking, so "mentee or
 * mentor" is not a role question — it is a party question, and the party is decided by
 * `TextSessionService` against the booking's own two user ids. A role check here would either
 * refuse the mentor or admit every mentee in the product.
 *
 * The guard it does run is the signed-in one, and it is here for the redirect: a signed-out
 * visitor following a session link is sent to sign in and returned to this exact address
 * afterwards. It is **not** the enforcement boundary — App Router layouts do not re-render on
 * a client-side navigation, so `page.tsx` calls the same guard itself (edge case 21).
 *
 * The layout sits under `[bookingId]` rather than under `sessions/` so it can read the id and
 * hand the guard the real return-to address instead of a generic one.
 */
export default async function SessionLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ bookingId: string }>;
}) {
  const { bookingId } = await params;
  const session = await requirePageSession(`/sessions/${bookingId}`);

  return <WorkspaceShell session={session}>{children}</WorkspaceShell>;
}
