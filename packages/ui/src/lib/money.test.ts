import { expect, it } from 'vitest';
import { priceLabel } from './money';

it.each([
  [12_000, 'PLN 120.00'],
  [4_999, 'PLN 49.99'],
  [5, 'PLN 0.05'],
  [0, 'PLN 0.00'],
])('renders %i minor units as %s', (cents, expected) => {
  expect(priceLabel(cents, 'PLN')).toBe(expected);
});

it('puts the caller\'s currency in front of the amount', () => {
  expect(priceLabel(12_000, 'EUR')).toBe('EUR 120.00');
});
