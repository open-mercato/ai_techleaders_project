import type { Role } from '@devmentor/core';
import { describe, expect, it } from 'vitest';
import { homeFor } from './session';

/**
 * `homeFor` is the single place the default landing is decided (spec UI/UX, "Role homes").
 * The OAuth callback and every page guard route through it, so the priority is asserted
 * here and nowhere else.
 */
describe('homeFor', () => {
  it.each([
    [['mentee'], '/home'],
    [['mentor'], '/mentor'],
    [['operator'], '/admin'],
  ] as ReadonlyArray<[Role[], string]>)('sends a %s to %s', (roles, expected) => {
    expect(homeFor(roles)).toBe(expected);
  });

  it('prefers operator over every other role', () => {
    expect(homeFor(['mentee', 'operator'])).toBe('/admin');
    expect(homeFor(['mentor', 'operator'])).toBe('/admin');
    expect(homeFor(['mentee', 'mentor', 'operator'])).toBe('/admin');
  });

  it('prefers mentor over mentee', () => {
    expect(homeFor(['mentee', 'mentor'])).toBe('/mentor');
  });

  it('does not depend on the order the roles arrive in', () => {
    expect(homeFor(['operator', 'mentee'])).toBe(homeFor(['mentee', 'operator']));
    expect(homeFor(['mentor', 'mentee'])).toBe(homeFor(['mentee', 'mentor']));
  });

  it('is total: an empty set still answers, rather than returning undefined', () => {
    // Unreachable in practice — `users.roles` is constrained non-empty and both
    // `resolveSessionFromCookie` and `UserService` refuse an empty derived set before a
    // caller could get here — but the fallback is what lets the parameter be a plain array
    // instead of a non-empty tuple, so it is asserted rather than assumed.
    expect(homeFor([])).toBe('/home');
  });
});
