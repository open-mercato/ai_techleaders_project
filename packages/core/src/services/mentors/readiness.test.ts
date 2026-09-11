import { describe, expect, it } from 'vitest';
import { mentorOfferReady, mentorPagePublishable } from './readiness';

describe('mentorPagePublishable', () => {
  it('uses the profile form field names and trims completeness-only text', () => {
    expect(
      mentorPagePublishable.evaluate({ publicWorkUrl: '  ', bio: null, stackTags: [] }),
    ).toEqual({
      ready: false,
      items: [
        { key: 'publicWorkUrl', label: 'Add a link to your public work.', met: false },
        { key: 'bio', label: 'Write a description of the work you have done.', met: false },
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

  it('does not require a technology', () => {
    expect(
      mentorPagePublishable.evaluate({
        publicWorkUrl: 'https://github.com/ada',
        bio: 'Compiler engineer',
        stackTags: [],
      }).ready,
    ).toBe(true);
  });
});

describe('mentorOfferReady', () => {
  it.each([
    [null, null, null, false],
    [new Date(0), null, null, false],
    [null, 9_000, null, false],
    [null, null, 18_000, false],
    [new Date(0), 9_000, null, false],
    [new Date(0), null, 18_000, false],
    [null, 9_000, 18_000, false],
    [new Date(0), 9_000, 18_000, true],
  ] as const)(
    'evaluates publication %j, 25-minute %j and 50-minute %j as ready=%j',
    (publishedAt, price25Cents, price50Cents, ready) => {
      expect(mentorOfferReady.evaluate({ publishedAt, price25Cents, price50Cents })).toEqual({
        ready,
        items: [
          { key: 'publishedAt', label: 'Publish your mentor page.', met: publishedAt !== null },
          { key: 'price25', label: 'Set your 25-minute price.', met: price25Cents !== null },
          { key: 'price50', label: 'Set your 50-minute price.', met: price50Cents !== null },
        ],
      });
    },
  );
});
