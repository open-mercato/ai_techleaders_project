import type { ReactNode } from "react";
import Link from "next/link";

/**
 * Admin/backend shell. Pages under `/admin` use shadcn-ui components from
 * `@devmentor/ui`. This layout provides the persistent nav.
 */
const nav = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/users", label: "Users" },
];

export default function AdminLayout({ children }: { children: ReactNode }) {
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
