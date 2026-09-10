import { describe, expect, it } from 'vitest';
import { formatInstant } from './formatInstant';

const INSTANT = '2026-09-24T08:00:00.000Z';

describe('formatInstant', () => {
  it('uses the English UTC date-and-time label by default', () => {
    expect(formatInstant(INSTANT)).toBe('24 September 2026 at 08:00 (UTC)');
  });

  it('accepts a caller format, locale and named timezone without allowing an implicit zone', () => {
    expect(formatInstant(INSTANT, {
      locale: 'pl-PL',
      timeZone: 'Europe/Warsaw',
      options: { day: 'numeric', month: 'long', year: 'numeric' },
    })).toBe('24 września 2026 (Europe/Warsaw)');
  });
});
