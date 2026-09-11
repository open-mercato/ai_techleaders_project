import type { EntityProperty } from '@mikro-orm/core';
import { describe, expect, it } from 'vitest';
import { baseProperties } from '../base.entity';
import { AuthRateLimit } from './rate-limit.entity';

/**
 * `init()` replaces a scalar property's `type` string with the resolved `Type` class, so
 * the readable assertion is on the class name.
 */
function typeName(property: EntityProperty): string {
  const { type } = property as unknown as { type: string | { name: string } };
  return typeof type === 'string' ? type : type.name;
}

const meta = AuthRateLimit.init().meta;
const properties = meta.properties;

describe('AuthRateLimit entity', () => {
  it('maps to the auth_rate_limits table', () => {
    expect(meta.className).toBe('AuthRateLimit');
    expect(meta.tableName).toBe('auth_rate_limits');
  });

  it('is exactly three columns: the natural key, the window and the count', () => {
    // The assertion that guards the documented exception below: an `id`, a `created_at`
    // or an `updated_at` appearing here is a regression, not an improvement.
    expect(Object.keys(properties).sort()).toEqual(['count', 'key', 'windowStart']);
  });

  it('deliberately does not spread baseProperties — the one entity that does not', () => {
    // A counter addressed by an already-unique natural key has no use for a uuid nobody
    // looks up, and `window_start`/`count` already say everything `created_at`/
    // `updated_at` would. See the entity's docblock for the full reasoning; this is the
    // test that makes "fixing" it fail loudly.
    for (const baseColumn of Object.keys(baseProperties)) {
      expect(properties).not.toHaveProperty(baseColumn);
    }
    expect(meta.primaryKeys).toEqual(['key']);
  });

  it('keys on text, so a scope plus a hex digest needs no width to be pinned', () => {
    expect(typeName(properties.key)).toBe('TextType');
    expect(properties.key.primary).toBe(true);
    expect(properties.key.nullable).toBeFalsy();
  });

  it('indexes window_start, which is the only non-primary-key lookup', () => {
    // The pruning delete every `consume` issues runs on this index; nothing else queries
    // the table by anything but the primary key.
    expect(typeName(properties.windowStart)).toBe('DateTimeType');
    expect(properties.windowStart.index).toBe(true);
    expect(properties.windowStart.nullable).toBeFalsy();
  });

  it('counts with a plain non-null integer', () => {
    expect(typeName(properties.count)).toBe('IntegerType');
    expect(properties.count.nullable).toBeFalsy();
  });
});
