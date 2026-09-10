import { requirePageRole } from "../../../lib/session";
import { UsersList } from "./users-list";

/**
 * `/admin/users` — the screen edge case 21 is written about.
 *
 * It used to be a single `'use client'` file. A Client Component cannot `await` a page
 * guard, and a guard that only ran in `admin/layout.tsx` would not run at all when the
 * router fetches this segment on a client-side navigation from `/admin` — which is exactly
 * how a revoked operator would still be served the page. So the page is a Server Component
 * that enforces the role and renders the heading, and the table moved to `users-list.tsx`
 * behind its own client boundary.
 *
 * That leaves three checks on the same data, none of them redundant: this guard, the
 * `authorize` on `GET /api/users`, and the operator check inside `UserService.list`.
 */

// The guard reads the session cookie and reloads the user; never prerendered.
export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  await requirePageRole("operator", "/admin/users");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground">
          Fetched from <code>/api/users</code> (built with <code>makeCrudRoute</code>)
          and rendered with <code>DataTable</code>.
        </p>
      </div>

      <UsersList />
    </div>
  );
}
