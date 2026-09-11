'use client';

import { WorkflowAction } from '../../backend/actions/WorkflowAction';

/**
 * Sign out — the first `WorkflowAction` (**F4**), and the one place the hard-navigation rule
 * is written down.
 *
 * `POST /api/auth/logout` expires the cookie and bumps `session_version`, and then
 * `onSuccess` performs a **hard** `window.location.assign('/')` rather than a client-side
 * push. Two reasons, and either one is sufficient:
 *
 * - The App Router caches rendered segments on the client. A soft push would re-display a
 *   tree that was server-rendered for the signed-in user — their name in the header, their
 *   nav — from a session that no longer exists, until something forced a fresh round trip.
 * - `packages/ui` has no `next` dependency (`eslint.config.mjs` enforces it), so there is no
 *   `useRouter` here to push with. The location assignment is not a workaround for that; it
 *   is the behaviour the spec asks for, and the missing dependency is why it cannot be
 *   quietly downgraded to a push later.
 *
 * It takes no props on purpose. Every surface that renders it renders the same button to the
 * same endpoint; a `label` prop would only invite two spellings of "Sign out".
 */
export function SignOutAction() {
  return (
    <WorkflowAction
      endpoint="/api/auth/logout"
      method="POST"
      label="Sign out"
      pendingLabel="Signing out…"
      variant="ghost"
      onSuccess={() => {
        // The rule below advises `redirect()` or `useRouter().push()`, and both are wrong
        // here: `redirect()` cannot be called from an event handler, a push would reuse the
        // router cache this sign-out has just invalidated, and `ui` has no `next` dependency
        // to import either of them from.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.assign('/');
      }}
    />
  );
}
