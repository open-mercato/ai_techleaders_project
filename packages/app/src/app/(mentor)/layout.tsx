import type { ReactNode } from 'react';
import { WorkspaceShell } from '../../components/workspace-shell';
import { requirePageRole } from '../../lib/session';

/**
 * The mentor surface — the same shape as the mentee layout, and separate on purpose: the
 * two are different route groups so a mentee opening a mentor screen is refused by this
 * layout's guard before any mentor chrome renders (edge case 19).
 *
 * The guard calls do not move: this one is for the redirect, and `mentor/page.tsx`
 * enforces. What changed in Slice 3 is what happens *after* it — the session it returns
 * feeds `WorkspaceShell`, whose navigation is the union of the held roles, so the seeded
 * operator (who also holds `mentor`) reaches `/admin` from here without signing out.
 */
export default async function MentorLayout({ children }: { children: ReactNode }) {
  const session = await requirePageRole('mentor', '/mentor');

  return <WorkspaceShell session={session}>{children}</WorkspaceShell>;
}
