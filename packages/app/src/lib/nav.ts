import type { Role } from '@devmentor/core';

/**
 * The signed-in workspace navigation, derived from the roles a user actually holds — step
 * 19 of `.ai/specs/2026-09-04-accounts-and-roles.md`.
 *
 * **Data, not JSX.** This module returns plain link descriptors and renders nothing.
 * `AppShell`'s `nav` is a `ReactNode` slot precisely because `ui` may not import `next`
 * (`eslint.config.mjs`), so *something* in `app` has to turn links into `<Link>`s — but
 * that something does not have to be the function that decides **which** links a role set
 * is allowed to see. Keeping the decision in a pure function means the interesting rules
 * (the union, the ordering, and the R07 negative below) are asserted in a `node` test with
 * no DOM and no renderer, and `components/workspace-shell.tsx` owns the one-line mapping
 * to `<Link>`.
 *
 * **The union, not a winner.** Roles are independent assignments, not personas: the seeded
 * operator also holds `mentor`, and a founder who mentors must reach both surfaces without
 * signing out. `navLinksFor` therefore concatenates every held role's links.
 *
 * **Ordering follows `homeFor`, not `ROLES`.** `ROLES` is declared least-privileged first
 * (`mentee`, `mentor`, `operator`) because that is the order the database column and its
 * `CHECK` were written in; using it here would open an operator's sidebar with "My
 * sessions" while `homeFor` had just dropped them on `/admin`, so the first link would
 * never be the page they are looking at. `homeFor`'s priority — `operator` → `mentor` →
 * `mentee` — makes the first link of the list the surface the session opened on, for every
 * combination of roles. The two orderings are separate constants on purpose: this one is an
 * editorial decision about a sidebar, and the other decides where a redirect lands.
 *
 * **R07 is a negative acceptance criterion**, so it is enforced structurally rather than
 * remembered: links exist only as literals in the closed table below, keyed by `Role`. There
 * is no computation from user input, no route in the table that grants a role, and no
 * "become a mentor" entry — mentors join by invitation (D08/D19). Adding one would mean
 * typing it into this table, and `nav.test.ts` asserts the whole reachable href set against
 * a closed list for every combination of roles, so an accidental growth fails the unit gate
 * before the integration assertion (step 20) ever runs.
 */

/** One workspace link: where it goes, and its accessible name. */
export interface NavLink {
  href: string;
  label: string;
}

/**
 * Every link each role may see. Typed `Record<Role, …>` so adding a role to `ROLES` is a
 * compile error here until someone decides what that role's surface is, rather than a
 * silently empty sidebar.
 *
 * Labels are sentence case and name the destination screen (`Guidelines.mdx`): they match
 * the `h1` of the page they open, so the link and the heading a screen reader announces on
 * arrival are the same words. `Users` is spelled exactly that way because
 * `tests/integration/admin.integration.test.ts` asserts `link "Users"`.
 */
const LINKS_BY_ROLE: Readonly<Record<Role, readonly NavLink[]>> = {
  operator: [
    { href: '/admin', label: 'Dashboard' },
    { href: '/admin/users', label: 'Users' },
  ],
  mentor: [{ href: '/mentor', label: 'Mentor workspace' }],
  mentee: [{ href: '/home', label: 'My sessions' }],
};

/**
 * The order roles contribute their links in — `homeFor`'s priority, so the list opens on
 * the surface the user landed on. A role missing from here would contribute nothing, which
 * `nav.test.ts` checks against `ROLES` for every member.
 */
const NAV_ORDER: readonly Role[] = ['operator', 'mentor', 'mentee'];

/**
 * The links a session may see, in one deterministic order.
 *
 * Driven by `NAV_ORDER` rather than by `roles`, which buys three properties for free: the
 * order does not depend on how the roles happened to be stored, a duplicate role cannot
 * produce a duplicate link, and an unknown value in the array contributes nothing.
 */
export function navLinksFor(roles: readonly Role[]): NavLink[] {
  return NAV_ORDER.filter((role) => roles.includes(role)).flatMap((role) => LINKS_BY_ROLE[role]);
}
