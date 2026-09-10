import type { ReactNode } from 'react';
import Link from 'next/link';
import type { Session } from '@devmentor/core';
import { SignOutAction } from '@devmentor/ui';
import { AppShell } from '@devmentor/ui/backend';
import { navLinksFor } from '../lib/nav';
import { displayNameFor } from '../lib/workspace-user';

/**
 * The chrome every signed-in surface renders — `AppShell` (primitives F2) filled in with
 * this session's navigation, name and sign-out.
 *
 * It lives here rather than in each layout because the three layouts differ in exactly one
 * thing, their guard, and that difference is the reason they are three files at all: a
 * mentee opening a mentor screen must be refused by `(mentor)/layout.tsx` before any mentor
 * chrome renders. Everything *after* the guard is identical, and copying it three times is
 * how one surface would quietly end up without a sign-out button, or with a fourth spelling
 * of a nav label. One composition also means R07 has one place to be true.
 *
 * It lives in `app`, not in `ui`, for the reason `nav` is a slot in the first place: this
 * file imports `next/link`, and `packages/ui` may not import `next`. The shell owns the
 * frame; the host owns routing and authorization.
 *
 * `session` is a parameter rather than something this component resolves, so the chrome
 * reuses the guard's answer instead of paying for — and, worse, re-deciding — a second
 * session resolution. The layout above has already awaited `requirePageRole`; this renders
 * what that returned.
 */
export async function WorkspaceShell({
  session,
  children,
}: {
  session: Session;
  children: ReactNode;
}) {
  const displayName = await displayNameFor(session.userId);

  return (
    <AppShell
      nav={navLinksFor(session.roles).map((link) => (
        <Link key={link.href} href={link.href}>
          {link.label}
        </Link>
      ))}
      user={{ displayName }}
      // Sign out is the first `WorkflowAction` and the one action every signed-in surface
      // carries, so it is wired here once rather than per layout.
      actions={<SignOutAction />}
    >
      {children}
    </AppShell>
  );
}
