import type { ReactNode } from 'react';
import Link from 'next/link';
import { SignOutAction } from '@devmentor/ui';
import { requirePageRole } from '../../lib/session';

/**
 * The mentee surface. Signed in, so shadcn components rather than the public Tailwind
 * pages (primitives F1); minimal chrome, because Slice 3 replaces it with `AppShell` and
 * the role-derived navigation and this slice is about the guard, not the frame.
 *
 * The guard here is for the redirect: a signed-out visitor is sent to sign in before any
 * segment below renders. It is **not** the enforcement boundary — App Router layouts do not
 * re-run on a client-side navigation, so `home/page.tsx` calls the same guard itself.
 */
export default async function MenteeLayout({ children }: { children: ReactNode }) {
  await requirePageRole('mentee', '/home');

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
