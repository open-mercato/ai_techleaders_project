import { describe, expect, it } from 'vitest';
import { ROLES, type Role } from '@devmentor/db';
import { navLinksFor } from './nav';

/**
 * Navigation is pure data, so this is an ordinary `node` test: no DOM, no renderer, and
 * every rule the sidebar encodes asserted directly.
 *
 * Three of them are load-bearing. The **union** (a combined-role user reaches every
 * permitted surface), the **order** (`homeFor`'s priority, so the first link is where the
 * session opened), and **R07** — no affordance anywhere in the navigation for becoming a
 * mentor. The last one is asserted against a navigation tree that actually has links in it,
 * for every combination of roles, because an absence assertion against an empty list passes
 * for the wrong reason.
 */

/** Every non-empty combination of roles a user could hold. */
function roleCombinations(): Role[][] {
  const combinations: Role[][] = [];
  for (let mask = 1; mask < 1 << ROLES.length; mask += 1) {
    combinations.push(ROLES.filter((_, index) => (mask & (1 << index)) !== 0));
  }
  return combinations;
}

describe('navLinksFor', () => {
  it('gives a mentee their sessions and nothing else', () => {
    expect(navLinksFor(['mentee'])).toEqual([{ href: '/home', label: 'My sessions' }]);
  });

  it('gives a mentor the mentor workspace and nothing else', () => {
    expect(navLinksFor(['mentor'])).toEqual([{ href: '/mentor', label: 'Mentor workspace' }]);
  });

  it('gives an operator the dashboard and the users list', () => {
    expect(navLinksFor(['operator'])).toEqual([
      { href: '/admin', label: 'Dashboard' },
      { href: '/admin/users', label: 'Users' },
    ]);
  });

  it('keeps the accessible name the admin integration test asserts on', () => {
    expect(navLinksFor(['operator']).map((link) => link.label)).toContain('Users');
  });

  it('unions the surfaces of a user holding operator and mentor', () => {
    // The seeded `mock-operator`: two independent assignments, both surfaces reachable
    // without signing out.
    expect(navLinksFor(['operator', 'mentor']).map((link) => link.href)).toEqual([
      '/admin',
      '/admin/users',
      '/mentor',
    ]);
  });

  it('unions all three surfaces and opens on the operator home', () => {
    expect(navLinksFor(['mentee', 'mentor', 'operator']).map((link) => link.href)).toEqual([
      '/admin',
      '/admin/users',
      '/mentor',
      '/home',
    ]);
  });

  it('orders by role priority rather than by the order the roles arrived in', () => {
    expect(navLinksFor(['mentee', 'mentor'])).toEqual(navLinksFor(['mentor', 'mentee']));
    expect(navLinksFor(['mentee', 'mentor'])[0]?.href).toBe('/mentor');
  });

  it('never repeats a link for a repeated role', () => {
    expect(navLinksFor(['mentor', 'mentor'])).toEqual([
      { href: '/mentor', label: 'Mentor workspace' },
    ]);
  });

  it('gives every declared role a surface', () => {
    // Guards the second half of the table: `Record<Role, …>` makes a new role a compile
    // error at the link list, but nothing type-checks its placement in the order array,
    // and a role missing from there would contribute no links at all.
    for (const role of ROLES) {
      expect(navLinksFor([role]).length).toBeGreaterThan(0);
    }
  });

  it('exposes no route that would grant a role, for any combination of roles (R07)', () => {
    const permitted = ['/admin', '/admin/users', '/mentor', '/home'];

    for (const roles of roleCombinations()) {
      const links = navLinksFor(roles);

      expect(links.length).toBeGreaterThan(0);
      for (const link of links) {
        expect(permitted).toContain(link.href);
        expect(link.label.toLowerCase()).not.toContain('become');
      }
    }
  });
});
