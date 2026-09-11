import { describe, expect, it } from 'vitest';
import { mentorProfileUpdateSchema } from './mentor-profile-update.schema';

describe('mentorProfileUpdateSchema', () => {
  it('allows an empty or partial draft update', () => {
    expect(mentorProfileUpdateSchema.parse({})).toEqual({});
    expect(mentorProfileUpdateSchema.parse({ bio: 'Built compilers.' })).toEqual({
      bio: 'Built compilers.',
    });
  });

  it('normalizes blank controls to null so saved draft fields can be cleared', () => {
    expect(mentorProfileUpdateSchema.parse({ publicWorkUrl: '', bio: '   ' })).toEqual({
      publicWorkUrl: null,
      bio: null,
    });
    expect(mentorProfileUpdateSchema.parse({ publicWorkUrl: null, bio: null })).toEqual({
      publicWorkUrl: null,
      bio: null,
    });
  });

  it.each(['ftp://example.com', 'github.com/ada', 'not a url'])('rejects unsafe URL %s', (url) => {
    expect(mentorProfileUpdateSchema.safeParse({ publicWorkUrl: url }).success).toBe(false);
  });

  it('accepts HTTP links, the controlled vocabulary, and four tags', () => {
    const input = {
      publicWorkUrl: 'https://github.com/ada',
      bio: 'Built compilers.',
      stackTags: ['TypeScript', 'React', 'Python', 'AI agents'],
    };
    expect(mentorProfileUpdateSchema.parse(input)).toEqual(input);
  });

  it('rejects duplicate tags even when the array stays within the four-tag limit', () => {
    const result = mentorProfileUpdateSchema.safeParse({
      stackTags: ['TypeScript', 'React', 'TypeScript'],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.stackTags).toEqual([
        'Choose each technology only once.',
      ]);
    }
  });

  it.each([
    { bio: 'x'.repeat(2001) },
    { stackTags: ['JavaScript'] },
    { stackTags: ['TypeScript', 'React', 'Python', 'AI agents', 'TypeScript'] },
  ])('rejects invalid profile shape %#', (input) => {
    expect(mentorProfileUpdateSchema.safeParse(input).success).toBe(false);
  });
});
