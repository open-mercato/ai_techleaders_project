import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { registerSchema, type RegisterInput } from './register.schema';
import { PASSWORD_MAX_BYTES, PASSWORD_MIN_CHARACTERS } from './fields';

/**
 * The `fieldErrors` a `422 validation_failed` carries.
 *
 * Deliberately a copy of `flattenZodError`, which exists twice in the repository for the
 * same reason the envelope type does — once in `core/src/http/makeCrudRoute.ts` and once
 * in `ui/src/backend/forms/CrudForm.tsx`, because `ui` must not import `core`. Neither is
 * exported, and this is what both of them do: one key per dotted path, `_root` for an
 * issue with no path, and the messages in order. Asserting on it is asserting on what a
 * user actually reads under the input.
 */
function fieldErrors(result: z.ZodSafeParseResult<unknown>): Record<string, string[]> {
  if (result.success) throw new Error('expected the parse to fail');
  const errors: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.length ? issue.path.map(String).join('.') : '_root';
    (errors[key] ??= []).push(issue.message);
  }
  return errors;
}

const VALID: RegisterInput = {
  email: 'ada@example.com',
  password: 'correct-horse-battery',
  displayName: 'Ada Lovelace',
};

/** A body missing exactly one required field, so each one is asked for on its own. */
function without(field: keyof RegisterInput): Record<string, unknown> {
  const body: Record<string, unknown> = { ...VALID };
  delete body[field];
  return body;
}

const TOO_LONG = `This password is too long. The limit is ${PASSWORD_MAX_BYTES} bytes; letters and digits count as one byte each, accented letters as two and most emoji as four.`;

describe('registerSchema accepts a well-formed registration', () => {
  it('accepts the three required fields', () => {
    expect(registerSchema.safeParse(VALID)).toEqual({ success: true, data: VALID });
  });

  it('accepts a returnTo alongside them and passes it through untouched', () => {
    const parsed = registerSchema.safeParse({ ...VALID, returnTo: '/mentors/ada?slot=1' });
    expect(parsed.success && parsed.data.returnTo).toBe('/mentors/ada?slot=1');
  });

  it('is assignable to the z.ZodType<T> prop CrudForm takes, which is the point of a shared schema', () => {
    const asCrudFormSchemaProp: z.ZodType<RegisterInput> = registerSchema;
    expect(asCrudFormSchemaProp.safeParse(VALID).success).toBe(true);
  });

  it('drops unknown keys, so a posted role never reaches the service', () => {
    const parsed = registerSchema.safeParse({ ...VALID, roles: ['operator'], emailVerifiedAt: new Date() });
    expect(parsed.success && parsed.data).toEqual(VALID);
  });
});

describe('registerSchema requires each field', () => {
  it('names all three on an empty body, and does not ask for returnTo', () => {
    expect(fieldErrors(registerSchema.safeParse({}))).toEqual({
      email: ['Enter a valid email address.'],
      password: ['Choose a password.'],
      displayName: ['Enter the name you want other people to see.'],
    });
  });

  it('reports only the missing email', () => {
    expect(fieldErrors(registerSchema.safeParse(without('email')))).toEqual({
      email: ['Enter a valid email address.'],
    });
  });

  it('reports only the missing password', () => {
    expect(fieldErrors(registerSchema.safeParse(without('password')))).toEqual({
      password: ['Choose a password.'],
    });
  });

  it('reports only the missing display name', () => {
    expect(fieldErrors(registerSchema.safeParse(without('displayName')))).toEqual({
      displayName: ['Enter the name you want other people to see.'],
    });
  });

  it('reports a body that is not an object under _root, which is what CrudForm shows above the fields', () => {
    expect(fieldErrors(registerSchema.safeParse(null))).toEqual({
      _root: ['Invalid input: expected object, received null'],
    });
  });

  it('carries one key per bad field, which is the shape a 422 hands back', () => {
    expect(fieldErrors(registerSchema.safeParse({ email: 'ada', password: 'short', displayName: '' }))).toEqual({
      email: ['Enter a valid email address.'],
      password: [`Use at least ${PASSWORD_MIN_CHARACTERS} characters.`],
      displayName: ['Enter the name you want other people to see.'],
    });
  });
});

describe('registerSchema checks the shape of the email address', () => {
  it('accepts an ordinary address', () => {
    expect(registerSchema.safeParse({ ...VALID, email: 'ada.lovelace+news@sub.example.co.uk' }).success).toBe(true);
  });

  it('refuses an address with no top-level domain, which looks close enough to be a typo', () => {
    expect(fieldErrors(registerSchema.safeParse({ ...VALID, email: 'ada@example' }))).toEqual({
      email: ['Enter a valid email address.'],
    });
  });

  it('refuses a hostname with no @', () => {
    expect(registerSchema.safeParse({ ...VALID, email: 'ada.example.com' }).success).toBe(false);
  });

  it('refuses an address that is padded with spaces, because this schema validates and never normalises', () => {
    expect(registerSchema.safeParse({ ...VALID, email: ' ada@example.com ' }).success).toBe(false);
  });

  it('accepts 254 characters and refuses 255, matching the users.email column', () => {
    const at254 = `${'a'.repeat(242)}@example.com`;
    expect(at254).toHaveLength(254);
    expect(registerSchema.safeParse({ ...VALID, email: at254 }).success).toBe(true);
    expect(fieldErrors(registerSchema.safeParse({ ...VALID, email: `a${at254}` }))).toEqual({
      email: ['This email address is too long. The limit is 254 characters.'],
    });
  });
});

describe('registerSchema enforces the password minimum in characters', () => {
  it('refuses 11 characters', () => {
    expect(fieldErrors(registerSchema.safeParse({ ...VALID, password: 'a'.repeat(11) }))).toEqual({
      password: [`Use at least ${PASSWORD_MIN_CHARACTERS} characters.`],
    });
  });

  it('accepts exactly 12', () => {
    expect(registerSchema.safeParse({ ...VALID, password: 'a'.repeat(12) }).success).toBe(true);
  });

  it('counts characters rather than bytes, so 11 accented letters are still too short at 22 bytes', () => {
    expect(fieldErrors(registerSchema.safeParse({ ...VALID, password: 'é'.repeat(11) }))).toEqual({
      password: [`Use at least ${PASSWORD_MIN_CHARACTERS} characters.`],
    });
  });
});

describe('registerSchema caps the password at 72 bytes, not 72 characters', () => {
  it('accepts 72 ASCII characters, which are 72 bytes', () => {
    expect(registerSchema.safeParse({ ...VALID, password: 'a'.repeat(72) }).success).toBe(true);
  });

  it('refuses 73 ASCII characters', () => {
    expect(fieldErrors(registerSchema.safeParse({ ...VALID, password: 'a'.repeat(73) }))).toEqual({
      password: [TOO_LONG],
    });
  });

  it('accepts 36 accented letters, which are exactly 72 bytes', () => {
    expect(registerSchema.safeParse({ ...VALID, password: 'é'.repeat(36) }).success).toBe(true);
  });

  it('refuses 37 accented letters at 74 bytes, although a character cap would have accepted them', () => {
    expect(fieldErrors(registerSchema.safeParse({ ...VALID, password: 'é'.repeat(37) }))).toEqual({
      password: [TOO_LONG],
    });
  });

  it('refuses 19 emoji at 76 bytes, and the message names bytes so the count makes sense', () => {
    const emoji = '🔒'.repeat(19);
    expect(emoji).toHaveLength(38);
    expect(fieldErrors(registerSchema.safeParse({ ...VALID, password: emoji }))).toEqual({
      password: [TOO_LONG],
    });
  });

  it('accepts 18 emoji at 72 bytes', () => {
    expect(registerSchema.safeParse({ ...VALID, password: '🔒'.repeat(18) }).success).toBe(true);
  });

  it('refuses rather than truncates, so two passwords sharing a 72-byte prefix stay distinct', () => {
    const prefix = 'a'.repeat(72);
    expect(registerSchema.safeParse({ ...VALID, password: `${prefix}1` }).success).toBe(false);
    expect(registerSchema.safeParse({ ...VALID, password: `${prefix}2` }).success).toBe(false);
  });
});

describe('registerSchema bounds the display name', () => {
  it('refuses the empty string', () => {
    expect(fieldErrors(registerSchema.safeParse({ ...VALID, displayName: '' }))).toEqual({
      displayName: ['Enter the name you want other people to see.'],
    });
  });

  it('refuses whitespace only, which a bare min(1) would have accepted', () => {
    expect(fieldErrors(registerSchema.safeParse({ ...VALID, displayName: '   ' }))).toEqual({
      displayName: ['Enter the name you want other people to see.'],
    });
  });

  it('accepts a single character', () => {
    expect(registerSchema.safeParse({ ...VALID, displayName: 'X' }).success).toBe(true);
  });

  it('accepts exactly 120 characters', () => {
    expect(registerSchema.safeParse({ ...VALID, displayName: 'a'.repeat(120) }).success).toBe(true);
  });

  it('refuses 121', () => {
    expect(fieldErrors(registerSchema.safeParse({ ...VALID, displayName: 'a'.repeat(121) }))).toEqual({
      displayName: ['This name is too long. The limit is 120 characters.'],
    });
  });

  it('trims before counting, so a padded 120-character name still fits', () => {
    const parsed = registerSchema.safeParse({ ...VALID, displayName: `  ${'a'.repeat(120)}  ` });
    expect(parsed.success && parsed.data.displayName).toBe('a'.repeat(120));
  });

  it('returns the trimmed name, so nothing downstream stores the padding', () => {
    const parsed = registerSchema.safeParse({ ...VALID, displayName: '  Ada Lovelace  ' });
    expect(parsed.success && parsed.data.displayName).toBe('Ada Lovelace');
  });
});

describe('registerSchema treats returnTo as an optional string', () => {
  it('accepts it when present', () => {
    expect(registerSchema.safeParse({ ...VALID, returnTo: '/home' }).success).toBe(true);
  });

  it('accepts it when absent, and does not invent a key', () => {
    const parsed = registerSchema.safeParse(VALID);
    expect(parsed.success && 'returnTo' in parsed.data).toBe(false);
  });

  it('accepts the empty string, which is what an untouched hidden CrudForm input submits', () => {
    const parsed = registerSchema.safeParse({ ...VALID, returnTo: '' });
    expect(parsed.success && parsed.data.returnTo).toBe('');
  });

  it('leaves an unsafe value to safeReturnTo rather than refusing it here', () => {
    expect(registerSchema.safeParse({ ...VALID, returnTo: '//evil.example' }).success).toBe(true);
  });

  it('refuses a non-string', () => {
    expect(fieldErrors(registerSchema.safeParse({ ...VALID, returnTo: 7 }))).toEqual({
      returnTo: ['Invalid input: expected string, received number'],
    });
  });
});
