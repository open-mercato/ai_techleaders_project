import { describe, expect, it } from 'vitest';
import { mentorPagePublishable } from './readiness';

describe('mentorPagePublishable', () => {
  it('uses the profile form field names and trims completeness-only text', () => {
    expect(
      mentorPagePublishable.evaluate({ publicWorkUrl: '  ', bio: null, stackTags: [] }),
    ).toEqual({
      ready: false,
      items: [
        { key: 'publicWorkUrl', label: 'Add a link to your public work.', met: false },
        { key: 'bio', label: 'Write a description of the work you have done.', met: false },
        { key: 'stackTags', label: 'Choose at least one technology.', met: false },
      ],
    });
  });

  it('is ready only when every publication requirement is present', () => {
    expect(
      mentorPagePublishable.evaluate({
        publicWorkUrl: 'https://github.com/ada',
        bio: 'Compiler engineer',
        stackTags: ['TypeScript'],
      }).ready,
    ).toBe(true);
  });
});
