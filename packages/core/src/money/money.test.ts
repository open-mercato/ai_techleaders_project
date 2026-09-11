import { describe, expect, it } from 'vitest';
import { parseMajorAmount, withinBounds, type Cents, type PriceBounds } from './money';

describe('money primitives', () => {
  it.each([
    ['0', 0],
    ['0.0', 0],
    ['0.00', 0],
    ['1', 100],
    ['1.2', 120],
    ['1.23', 123],
    ['20.00', 2_000],
    ['21474836.47', 2_147_483_647],
  ])('parses canonical major amount %s to %i cents', (value, expected) => {
    const cents: Cents | null = parseMajorAmount(value);
    expect(cents).toBe(expected);
  });

  it.each([
    '', ' ', ' 1', '1 ', '+1', '-1', '.50', '00', '01', '1.', '1.234',
    '1e2', '1E2', '1,000', 'NaN', 'Infinity',
  ])('rejects non-canonical or over-precise input %j', (value) => {
    expect(parseMajorAmount(value)).toBeNull();
  });

  it.each(['21474836.48', '99999999999', '999999999999999999999999999999999999999999'])(
    'rejects PostgreSQL integer overflow for %s',
    (value) => {
      expect(parseMajorAmount(value)).toBeNull();
    },
  );

  it('checks both price boundaries inclusively', () => {
    const bounds: PriceBounds = { minCents: 9_000, maxCents: 60_000 };
    expect(withinBounds(bounds.minCents, bounds.minCents, bounds.maxCents)).toBe(true);
    expect(withinBounds(bounds.maxCents, bounds.minCents, bounds.maxCents)).toBe(true);
    expect(withinBounds(bounds.minCents - 1, bounds.minCents, bounds.maxCents)).toBe(false);
    expect(withinBounds(bounds.maxCents + 1, bounds.minCents, bounds.maxCents)).toBe(false);
  });
});
