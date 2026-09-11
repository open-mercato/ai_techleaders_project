import { describe, expect, it } from 'vitest';
import { MAX_SLUG_LENGTH, RESERVED_SLUGS, slugify, uniqueSlug } from './slug';

describe('public slugs', () => {
  it.each([
    ['Ada Lovelace', 'ada-lovelace'],
    ['  François  D’Éon! ', 'francois-d-eon'],
    ['C++ / Rust', 'c-rust'],
    ['🎉', 'mentor'],
  ])('normalizes %j to %s', (value, expected) => {
    expect(slugify(value)).toBe(expected);
  });

  it('keeps the first unreserved candidate and numbers a collision chain', () => {
    expect(uniqueSlug('Ada Lovelace')).toBe('ada-lovelace');
    expect(uniqueSlug('Ada Lovelace', 2)).toBe('ada-lovelace-2');
    expect(uniqueSlug('Ada Lovelace', 3)).toBe('ada-lovelace-3');
  });

  it('never emits a reserved candidate', () => {
    expect(RESERVED_SLUGS.has('admin')).toBe(true);
    expect(uniqueSlug('Admin')).toBe('admin-2');
    expect(uniqueSlug('Admin', 2)).toBe('admin-3');
  });

  it('truncates the base again for every suffix', () => {
    const name = 'a'.repeat(100);
    expect(uniqueSlug(name)).toHaveLength(MAX_SLUG_LENGTH);
    expect(uniqueSlug(name, 100)).toHaveLength(MAX_SLUG_LENGTH);
    expect(uniqueSlug(name, 100).endsWith('-100')).toBe(true);
  });
});
