import { describe, expect, it } from 'vitest';
import { ROLES } from './roles';

describe('ROLES', () => {
  it('is the three roles the product recognises, in ascending privilege order', () => {
    // The membership CHECK on `users.roles` is generated from this list, so editing it
    // is a schema change: a new migration must add the value, and removing one is an
    // expand-then-contract migration because existing rows may hold it.
    expect(ROLES).toEqual(['mentee', 'mentor', 'operator']);
  });
});
