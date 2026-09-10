import type { ReactNode } from "react";
import Link from "next/link";
import { requirePageRole } from "../../lib/session";

/**
 * Admin/backend shell. Pages under `/admin` use shadcn-ui components from
 * `@devmentor/ui`. This layout provides the persistent nav.
 *
 * The guard is for the redirect, not for enforcement: `/admin` and `/admin/users` each call
 * it themselves, because a layout does not re-run when the router fetches a sibling segment
 * on a client-side navigation (edge case 21). `'/admin'` is the path it reports, and it is
 * the layout's own segment rather than the visitor's exact URL — a Server Component has no
 * way to ask for the latter — so a signed-out visitor deep-linking to `/admin/users` returns
 * to `/admin` after signing in. The page below carries the precise `returnTo`; whichever
 * guard runs first wins, and on a full navigation that is this one.
 *
 * The chrome is unchanged in this slice on purpose: Slice 3 ports it to `AppShell`, and the
 * accessible `link "Users"` that `admin.integration.test.ts` asserts on survives both moves.
 */
const nav = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/users", label: "Users" },
];

export default async function AdminLayout({ children }: { children: ReactNode }) {
  await requirePageRole("operator", "/admin");

  return (
    <div className="flex min-h-screen">
      <aside className="w-60 shrink-0 border-r border-border bg-card p-6">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          DevMentor
        </Link>
        <p className="mt-1 text-xs text-muted-foreground">Admin</p>
        <nav className="mt-8 flex flex-col gap-1">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="flex-1 p-8">{children}</main>
    </div>
  );
}
