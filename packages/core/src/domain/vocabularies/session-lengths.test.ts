import { describe, expect, it } from 'vitest';
import {
  SessionLengths,
  sessionLengthMinutes,
  type SessionLength,
  type SessionLengthMinutes,
} from './session-lengths';

describe('SessionLengths', () => {
  it('exposes string keys and form options from one definition', () => {
    expect(SessionLengths.values).toEqual(['25', '50']);
    expect(SessionLengths.options).toEqual([
      { value: '25', label: '25' },
      { value: '50', label: '50' },
    ]);
  });

  it.each([
    ['25', 25],
    ['50', 50],
  ] as const)('accepts and converts the canonical %s-minute length', (value, expected) => {
    const parsed: SessionLength = SessionLengths.schema.parse(value);
    const minutes: SessionLengthMinutes = sessionLengthMinutes(parsed);
    expect(minutes).toBe(expected);
  });

  it.each([25, 50, '025', '30', '', null, undefined])(
    'rejects a value outside the vocabulary: %j',
    (value) => {
      expect(SessionLengths.schema.safeParse(value).success).toBe(false);
    },
  );
});
