import { z } from 'zod';

/**
 * The field-level rules `registerSchema` and `loginSchema` share.
 *
 * Both schemas are parsed on the server by the route and again in the browser by
 * `CrudForm`, so a rule that lived in only one of the two files would be a rule the two
 * forms disagree about. Composition stays in the schema files — each of them reads as a
 * complete statement of its own contract — and only the rules themselves live here.
 */

/**
 * 254 characters is RFC 5321's ceiling for an address in a reverse-path, and it is also
 * what `users.email` can hold (`varchar(255)`). Without the bound, an address that is
 * merely long is refused by PostgreSQL as a 500 rather than by the schema as a 422, and
 * an unbounded string reaches the per-email rate-limit key on the way there.
 */
export const EMAIL_MAX_CHARACTERS = 254;

/**
 * The address is validated, never normalised. Trimming or lower-casing it here would make
 * this schema a second opinion on what counts as the same account: `email` is the unique
 * column and the key `findOrCreateFromGithub` links a GitHub identity on, and GitHub's
 * copy of the address never passes through here. Whatever normalisation that key deserves
 * belongs where both paths meet, not in the half of the system that has a form in front
 * of it.
 */
export const emailSchema = z
  .email('Enter a valid email address.')
  .max(EMAIL_MAX_CHARACTERS, `This email address is too long. The limit is ${EMAIL_MAX_CHARACTERS} characters.`);

/**
 * Where the browser goes once it is signed in. Validated as a string and nothing more.
 *
 * `safeReturnTo` (platform primitives B7) is the authority, and it runs on the server at
 * the moment of the redirect — it is what refuses `//evil.example`, `/api/…` and a
 * tab-smuggled authority. Re-stating any part of that rule here would create a second
 * copy to keep in step with the first, and it would still not be the check that decides.
 *
 * **The empty string is accepted on purpose.** `CrudForm` builds its candidate from every
 * declared field, so an untouched hidden `returnTo` input submits `''` rather than being
 * absent, and `safeReturnTo('')` already falls back to the role home.
 */
export const returnToSchema = z.string().optional();

/**
 * How many characters a new password must have. Counted in characters, not bytes: the
 * minimum is a statement about how much the person typed, and six accented letters — 12
 * bytes — are not the twelve this asks for. JavaScript counts UTF-16 code units, so a
 * pair of emoji counts as four rather than two; that is the lenient direction, and six
 * random emoji are not the password this floor exists to refuse.
 */
export const PASSWORD_MIN_CHARACTERS = 12;

export const PASSWORD_TOO_SHORT_MESSAGE = `Use at least ${PASSWORD_MIN_CHARACTERS} characters.`;

/**
 * The cap is **72 bytes, not 72 characters**, measured on the UTF-8 encoding.
 *
 * The spec calls it a byte cap and gives the reason: an unbounded string fed into a
 * deliberately expensive hash is free amplification, and it is the bounded input the
 * hashing concurrency gate is sized against. What reaches `PasswordService` is bytes, so
 * bytes is the unit the reason is stated in. `z.string().max(72)` counts UTF-16 code
 * units instead — `é` is one code unit and two bytes, most emoji are two code units and
 * four — so a 72-code-unit password of emoji is 288 bytes, four times the bound the
 * number was chosen for. Counting characters does not implement the sentence the spec
 * wrote.
 *
 * Bytes are never fewer than code units in UTF-8, so this subsumes a 72-character cap and
 * there is no second `.max()` to keep in step with it.
 *
 * 72 is bcrypt's historical truncation length. This project hashes with scrypt
 * (`services/auth/password.service.ts`), which does not truncate, so nothing is silently
 * lost either way — but truncating to fit is not an option this schema leaves open in the
 * first place: two different passwords that hash to the same digest would both open one
 * account. Over the cap is refused, never trimmed.
 */
export const PASSWORD_MAX_BYTES = 72;

/**
 * The message names the unit, because someone who typed 40 emoji did not type 72 of
 * anything and would otherwise be told a limit they appear to be well under.
 */
export const PASSWORD_TOO_LONG_MESSAGE =
  `This password is too long. The limit is ${PASSWORD_MAX_BYTES} bytes; letters and digits count as one byte each, accented letters as two and most emoji as four.`;

const utf8 = new TextEncoder();

export function isWithinPasswordByteCap(value: string): boolean {
  return utf8.encode(value).length <= PASSWORD_MAX_BYTES;
}
