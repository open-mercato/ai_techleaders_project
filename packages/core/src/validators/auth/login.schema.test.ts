import { describe, expect, it } from 'vitest';
import type { z } from 'zod';
import { loginSchema, type LoginInput } from './login.schema';
import { registerSchema } from './register.schema';
import { PASSWORD_MAX_BYTES } from './fields';

/** The `fieldErrors` a `422 validation_failed` carries — see `register.schema.test.ts`. */
function fieldErrors(result: z.ZodSafeParseResult<unknown>): Record<string, string[]> {
  if (result.success) throw new Error('expected the parse to fail');
  const errors: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.length ? issue.path.map(String).join('.') : '_root';
    (errors[key] ??= []).push(issue.message);
  }
  return errors;
}

const VALID: LoginInput = { email: 'ada@example.com', password: 'correct-horse-battery' };

const TOO_LONG = `This password is too long. The limit is ${PASSWORD_MAX_BYTES} bytes; letters and digits count as one byte each, accented letters as two and most emoji as four.`;

describe('loginSchema accepts a well-formed sign-in', () => {
  it('accepts an address and a password', () => {
    expect(loginSchema.safeParse(VALID)).toEqual({ success: true, data: VALID });
  });

  it('accepts a returnTo alongside them and passes it through untouched', () => {
    const parsed = loginSchema.safeParse({ ...VALID, returnTo: '/mentors/ada?slot=1' });
    expect(parsed.success && parsed.data.returnTo).toBe('/mentors/ada?slot=1');
  });

  it('is assignable to the z.ZodType<T> prop CrudForm takes, which is the point of a shared schema', () => {
    const asCrudFormSchemaProp: z.ZodType<LoginInput> = loginSchema;
    expect(asCrudFormSchemaProp.safeParse(VALID).success).toBe(true);
  });

  it('drops unknown keys', () => {
    const parsed = loginSchema.safeParse({ ...VALID, roles: ['operator'], sessionVersion: 9 });
    expect(parsed.success && parsed.data).toEqual(VALID);
  });

  it('has no displayName field, so sign-in cannot carry a profile edit', () => {
    const parsed = loginSchema.safeParse({ ...VALID, displayName: 'Someone Else' });
    expect(parsed.success && 'displayName' in parsed.data).toBe(false);
  });
});

describe('loginSchema requires each field', () => {
  it('names both on an empty body', () => {
    expect(fieldErrors(loginSchema.safeParse({}))).toEqual({
      email: ['Enter a valid email address.'],
      password: ['Enter your password.'],
    });
  });

  it('reports only the missing email', () => {
    expect(fieldErrors(loginSchema.safeParse({ password: 'correct-horse-battery' }))).toEqual({
      email: ['Enter a valid email address.'],
    });
  });

  it('reports only the missing password', () => {
    expect(fieldErrors(loginSchema.safeParse({ email: 'ada@example.com' }))).toEqual({
      password: ['Enter your password.'],
    });
  });

  it('reports a body that is not an object under _root', () => {
    expect(fieldErrors(loginSchema.safeParse('ada@example.com'))).toEqual({
      _root: ['Invalid input: expected object, received string'],
    });
  });

  it('carries one key per bad field, which is the shape a 422 hands back', () => {
    expect(fieldErrors(loginSchema.safeParse({ email: 'ada', password: 'a'.repeat(73) }))).toEqual({
      email: ['Enter a valid email address.'],
      password: [TOO_LONG],
    });
  });
});

describe('loginSchema checks the shape of the email address', () => {
  it('accepts an ordinary address', () => {
    expect(loginSchema.safeParse({ ...VALID, email: 'ada.lovelace+news@sub.example.co.uk' }).success).toBe(true);
  });

  it('refuses an address with no top-level domain', () => {
    expect(fieldErrors(loginSchema.safeParse({ ...VALID, email: 'ada@example' }))).toEqual({
      email: ['Enter a valid email address.'],
    });
  });

  it('accepts 254 characters and refuses 255, exactly as registration does', () => {
    const at254 = `${'a'.repeat(242)}@example.com`;
    expect(loginSchema.safeParse({ ...VALID, email: at254 }).success).toBe(true);
    expect(fieldErrors(loginSchema.safeParse({ ...VALID, email: `a${at254}` }))).toEqual({
      email: ['This email address is too long. The limit is 254 characters.'],
    });
  });
});

describe('loginSchema puts no minimum on the password, deliberately', () => {
  it('accepts a password shorter than the registration minimum, so an account created under an older rule can still sign in', () => {
    expect(loginSchema.safeParse({ ...VALID, password: 'hunter2' }).success).toBe(true);
    expect(registerSchema.safeParse({ email: VALID.email, password: 'hunter2', displayName: 'Ada' }).success).toBe(false);
  });

  it('accepts a single character', () => {
    expect(loginSchema.safeParse({ ...VALID, password: 'x' }).success).toBe(true);
  });

  it('accepts the empty string, leaving the refusal to the generic 401 rather than a 422 that names the policy', () => {
    const parsed = loginSchema.safeParse({ ...VALID, password: '' });
    expect(parsed.success && parsed.data.password).toBe('');
  });
});

describe('loginSchema caps the password at 72 bytes, on the same terms as registration', () => {
  it('accepts 72 ASCII characters', () => {
    expect(loginSchema.safeParse({ ...VALID, password: 'a'.repeat(72) }).success).toBe(true);
  });

  it('refuses 73 ASCII characters', () => {
    expect(fieldErrors(loginSchema.safeParse({ ...VALID, password: 'a'.repeat(73) }))).toEqual({
      password: [TOO_LONG],
    });
  });

  it('accepts 36 accented letters at exactly 72 bytes', () => {
    expect(loginSchema.safeParse({ ...VALID, password: 'é'.repeat(36) }).success).toBe(true);
  });

  it('refuses 37 accented letters at 74 bytes, although they are only 37 characters', () => {
    expect(fieldErrors(loginSchema.safeParse({ ...VALID, password: 'é'.repeat(37) }))).toEqual({
      password: [TOO_LONG],
    });
  });

  it('refuses 19 emoji at 76 bytes and gives the same message registration gives', () => {
    expect(fieldErrors(loginSchema.safeParse({ ...VALID, password: '🔒'.repeat(19) }))).toEqual({
      password: [TOO_LONG],
    });
    expect(fieldErrors(registerSchema.safeParse({ email: VALID.email, password: '🔒'.repeat(19), displayName: 'Ada' }))).toEqual({
      password: [TOO_LONG],
    });
  });
});

describe('loginSchema treats returnTo as an optional string', () => {
  it('accepts it when present', () => {
    expect(loginSchema.safeParse({ ...VALID, returnTo: '/home' }).success).toBe(true);
  });

  it('accepts it when absent, and does not invent a key', () => {
    const parsed = loginSchema.safeParse(VALID);
    expect(parsed.success && 'returnTo' in parsed.data).toBe(false);
  });

  it('accepts the empty string, which is what an untouched hidden CrudForm input submits', () => {
    const parsed = loginSchema.safeParse({ ...VALID, returnTo: '' });
    expect(parsed.success && parsed.data.returnTo).toBe('');
  });

  it('leaves an unsafe value to safeReturnTo rather than refusing it here', () => {
    expect(loginSchema.safeParse({ ...VALID, returnTo: '/api/users' }).success).toBe(true);
  });

  it('refuses a non-string', () => {
    expect(fieldErrors(loginSchema.safeParse({ ...VALID, returnTo: ['/home'] }))).toEqual({
      returnTo: ['Invalid input: expected string, received array'],
    });
  });
});
