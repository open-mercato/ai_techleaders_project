import type { ReactNode } from 'react';
import { WorkspaceShell } from '../../components/workspace-shell';
import { requirePageRole } from '../../lib/session';

/**
 * The mentee surface — signed in, so `AppShell` and shadcn rather than the public Tailwind
 * pages (primitives F1).
 *
 * The guard here is for the redirect: a signed-out visitor is sent to sign in before any
 * segment below renders. It is **not** the enforcement boundary — App Router layouts do not
 * re-run on a client-side navigation, so `home/page.tsx` calls the same guard itself.
 *
 * Its return value is the session the chrome is built from. Navigation comes from the union
 * of the held roles, so a mentee who is also a mentor sees both surfaces here and does not
 * have to guess a URL; a mentee who is only a mentee sees one link, and no path to becoming
 * a mentor exists anywhere in it (R07).
 */
export default async function MenteeLayout({ children }: { children: ReactNode }) {
  const session = await requirePageRole('mentee', '/home');

  return <WorkspaceShell session={session}>{children}</WorkspaceShell>;
}
