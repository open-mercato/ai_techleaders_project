import { describe, expect, it } from 'vitest';
import { StackTags, type StackTag } from './stack-tags';

describe('StackTags', () => {
  it('exposes the approved beachhead as values and form options from one definition', () => {
    expect(StackTags.values).toEqual(['TypeScript', 'React', 'Python', 'AI agents']);
    expect(StackTags.options).toEqual([
      { value: 'TypeScript', label: 'TypeScript' },
      { value: 'React', label: 'React' },
      { value: 'Python', label: 'Python' },
      { value: 'AI agents', label: 'AI agents' },
    ]);
  });

  it.each(StackTags.values)('accepts the canonical %s tag', (value) => {
    const parsed: StackTag = StackTags.schema.parse(value);
    expect(parsed).toBe(value);
  });

  it.each(['JavaScript', 'AI agent', 'typescript', '', null, 42])(
    'rejects a value outside the vocabulary: %j',
    (value) => {
      expect(StackTags.schema.safeParse(value).success).toBe(false);
    },
  );
});
