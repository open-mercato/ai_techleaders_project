import type { ReactNode } from "react";
import { WorkspaceShell } from "../../components/workspace-shell";
import { requirePageRole } from "../../lib/session";

/**
 * Admin/backend shell. Pages under `/admin` use shadcn-ui components from
 * `@devmentor/ui`, now inside `AppShell` (primitives F1/F2) like the other two signed-in
 * surfaces.
 *
 * The guard is for the redirect, not for enforcement: `/admin` and `/admin/users` each call
 * it themselves, because a layout does not re-run when the router fetches a sibling segment
 * on a client-side navigation (edge case 21). `'/admin'` is the path it reports, and it is
 * the layout's own segment rather than the visitor's exact URL — a Server Component has no
 * way to ask for the latter — so a signed-out visitor deep-linking to `/admin/users` returns
 * to `/admin` after signing in. The page below carries the precise `returnTo`; whichever
 * guard runs first wins, and on a full navigation that is this one.
 *
 * The bespoke sidebar this file used to carry is gone, and the accessible semantics it
 * carried are not: `admin.integration.test.ts` asserts `link "Users"`, and the operator's
 * links in `lib/nav.ts` still spell it exactly that way. The wordmark is no longer a link to
 * `/` — `AppShell` renders it as the workspace brand — which nothing asserts on and which
 * `BACKWARD_COMPATIBILITY.md` does not protect; the spec grades this port as not a breaking
 * change for that reason.
 *
 * An operator who also holds `mentor` now sees the mentor surface from here too: the
 * navigation is built from the union of the held roles, not from the segment.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await requirePageRole("operator", "/admin");

  return <WorkspaceShell session={session}>{children}</WorkspaceShell>;
}
