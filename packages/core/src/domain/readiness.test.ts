import { describe, expect, it } from 'vitest';
import { ValidationError } from '../http/errors';
import { defineReadiness } from './readiness';

interface Candidate {
  link: boolean;
  bio: boolean;
}

const gate = defineReadiness<Candidate, 'link' | 'bio'>([
  { key: 'link', label: 'Add a link', met: (value) => value.link },
  { key: 'bio', label: 'Write a bio', met: (value) => value.bio },
]);

describe('defineReadiness', () => {
  it('reports and accepts a fully ready value', () => {
    const result = { ready: true, items: [
      { key: 'link', label: 'Add a link', met: true },
      { key: 'bio', label: 'Write a bio', met: true },
    ] };
    expect(gate.evaluate({ link: true, bio: true })).toEqual(result);
    expect(gate.assert({ link: true, bio: true })).toEqual(result);
  });

  it('reports a partially ready value', () => {
    expect(gate.evaluate({ link: true, bio: false })).toEqual({
      ready: false,
      items: [
        { key: 'link', label: 'Add a link', met: true },
        { key: 'bio', label: 'Write a bio', met: false },
      ],
    });
    expect(() => gate.assert({ link: true, bio: false })).toThrowError(ValidationError);
  });

  it('reports no requirements met', () => {
    expect(gate.evaluate({ link: false, bio: false }).ready).toBe(false);
  });

  it('keys refusal details for the fields that can fix them', () => {
    expect(() => gate.assert({ link: false, bio: false })).toThrowError(ValidationError);
    try {
      gate.assert({ link: false, bio: false });
    } catch (error) {
      expect(error).toMatchObject({
        status: 422,
        fieldErrors: { link: ['Add a link'], bio: ['Write a bio'] },
      });
    }
  });
});
