/**
 * The roles a user may hold. `db` is the leaf package, so this is the single source of
 * truth for the union: the entity's `roles` column is built from it (which is what makes
 * MikroORM generate the membership `CHECK` constraint), and `core` re-exports it so the
 * rest of the monorepo never redeclares the list.
 *
 * A user may hold more than one role — mentor and operator are independent assignments,
 * not mutually exclusive personas. The union is effectively append-only once shipped:
 * `SDLC.md` grades tightening a constraint existing rows may violate as breaking, so
 * removing a value later is an expand-then-contract migration.
 */
export const ROLES = ['mentee', 'mentor', 'operator'] as const;

export type Role = (typeof ROLES)[number];
