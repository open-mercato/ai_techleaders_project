import type { ReactNode } from 'react';
import Link from 'next/link';
import { SignOutAction } from '@devmentor/ui';
import { requirePageRole } from '../../lib/session';

/**
 * The mentor surface — the same shape as the mentee layout, and separate on purpose: the
 * two are different route groups so a mentee opening a mentor screen is refused by this
 * layout's guard before any mentor chrome renders (edge case 19).
 *
 * Slice 3 replaces both frames with `AppShell` and a navigation built from the union of the
 * held roles, at which point a mentor who is also an operator sees both sets of links. The
 * guard calls do not move: this one is for the redirect, and `mentor/page.tsx` enforces.
 */
export default async function MentorLayout({ children }: { children: ReactNode }) {
  await requirePageRole('mentor', '/mentor');

  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-border bg-card px-6 py-4">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          DevMentor
        </Link>
        <SignOutAction />
      </header>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
