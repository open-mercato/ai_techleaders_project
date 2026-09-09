import { describe, expect, it } from 'vitest';
import { resolveLiveRoles, type OperatorAuthoritySubject } from './operator-authority';

const VERIFIED = new Date('2026-09-01T00:00:00.000Z');

function subject(overrides: Partial<OperatorAuthoritySubject> = {}): OperatorAuthoritySubject {
  return {
    roles: ['mentee'],
    email: 'ada@devmentor.dev',
    emailVerifiedAt: VERIFIED,
    ...overrides,
  };
}

describe('resolveLiveRoles', () => {
  it('leaves a stored set alone when the allowlist is empty', () => {
    expect(resolveLiveRoles(subject({ roles: ['mentee', 'mentor'] }), [])).toEqual([
      'mentee',
      'mentor',
    ]);
  });

  it('adds operator for an allowlisted address that holds no stored operator role', () => {
    // Edge case 25: authority applies on the next request, with no sign-out/sign-in cycle.
    expect(
      resolveLiveRoles(subject({ roles: ['mentee'] }), ['ada@devmentor.dev']),
    ).toEqual(['mentee', 'operator']);
  });

  it('removes a stored operator role once the address leaves the allowlist', () => {
    // Edge case 24, the direction a sign-in-only reconciliation would miss entirely.
    expect(
      resolveLiveRoles(subject({ roles: ['mentee', 'operator'] }), ['someone@else.dev']),
    ).toEqual(['mentee']);
  });

  it('keeps every other role while granting operator', () => {
    expect(
      resolveLiveRoles(subject({ roles: ['mentee', 'mentor'] }), ['ada@devmentor.dev']),
    ).toEqual(['mentee', 'mentor', 'operator']);
  });

  it('keeps every other role while revoking operator', () => {
    expect(
      resolveLiveRoles(subject({ roles: ['mentee', 'mentor', 'operator'] }), []),
    ).toEqual(['mentee', 'mentor']);
  });

  it('matches the allowlist case-insensitively and ignores surrounding whitespace', () => {
    // `OPERATOR_EMAILS` is normalized at parse time, so only the row's own address is
    // folded here — a row stored as `Ada@DevMentor.dev` must still match.
    expect(
      resolveLiveRoles(subject({ email: '  Ada@DevMentor.DEV ' }), ['ada@devmentor.dev']),
    ).toEqual(['mentee', 'operator']);
  });

  it('never promotes an allowlisted address on an unverified row', () => {
    // Before E01 anyone could create a row for any address, so an unverified allowlisted
    // email is not evidence the founder controls it.
    expect(
      resolveLiveRoles(subject({ emailVerifiedAt: null }), ['ada@devmentor.dev']),
    ).toEqual(['mentee']);
  });

  it('treats an absent verification timestamp the same as an explicit null', () => {
    expect(
      resolveLiveRoles(subject({ emailVerifiedAt: undefined }), ['ada@devmentor.dev']),
    ).toEqual(['mentee']);
  });

  it('still revokes operator on an unverified row', () => {
    // The verification rule gates the grant, never the revocation: an unverifiable row
    // must not keep authority it can no longer prove.
    expect(
      resolveLiveRoles(
        subject({ roles: ['mentee', 'operator'], emailVerifiedAt: null }),
        ['ada@devmentor.dev'],
      ),
    ).toEqual(['mentee']);
  });

  it('is order-stable and duplicate-free, so two derivations compare equal', () => {
    const first = resolveLiveRoles(
      subject({ roles: ['operator', 'mentor', 'mentee', 'mentee'] }),
      ['ada@devmentor.dev'],
    );
    const second = resolveLiveRoles(subject({ roles: ['mentee', 'mentor'] }), [
      'ada@devmentor.dev',
    ]);

    expect(first).toEqual(['mentee', 'mentor', 'operator']);
    expect(first).toEqual(second);
  });

  it('derives an empty set when the only stored role was the operator cache', () => {
    // Not something the caller may ignore: `requireSession` turns this into an internal
    // error, because D19 gives every account a base role on top of which operator is
    // granted.
    expect(resolveLiveRoles(subject({ roles: ['operator'] }), [])).toEqual([]);
  });
});
