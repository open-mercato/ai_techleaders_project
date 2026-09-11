/**
 * The password the seeded personas sign in with, and its hash.
 *
 * **Why a stored constant rather than a hash computed at seed time.** The seeder needs a
 * real hash, but `packages/db` may not import `@devmentor/core` (`eslint.config.mjs`
 * enforces the direction), and the only password hasher in the repository is
 * `core/src/services/auth/password.service.ts`. That leaves two honest options: re-implement
 * the KDF here with a second copy of its parameters, or freeze one value produced by the
 * real algorithm and prove it still verifies. The copy is the worse one — it is a second,
 * unreviewed credential-hashing call
 * site in the package that is supposed to be the leaf, and its parameters drift from the
 * verifier's the first time anybody tunes them, silently, because nothing compares the two.
 *
 * A stored constant has the opposite property: the encoding below is **self-describing**, so
 * changing the hashing parameters cannot invalidate it. `ln`, `r` and `p` travel with the
 * digest, a correct `verify` reads them from the string it was given, and the seeded rows
 * keep working exactly like the rows of real users who registered before the change. That is
 * the whole reason a password hash is encoded this way, and it is why this file can hold a
 * frozen value without owning a KDF.
 *
 * **What is still allowed to break it, and what catches that.** A change to the *encoding*
 * or the *algorithm* — not the parameters — would make the real `verify` reject this string.
 * Two tests stand in the way:
 *
 * - `packages/core/src/services/auth/seed-password.guard.test.ts` verifies this exact
 *   constant with the real `PasswordService`. That is the guard that matters: it fails the
 *   moment the seeded hash stops being a credential the product accepts.
 * - `seed-password.test.ts` beside this file decodes the string and re-derives the digest
 *   with `node:crypto`, using the parameters carried *in the value* rather than any copy of
 *   them. It proves the constant is genuinely a scrypt hash of `SEED_PASSWORD` and not a
 *   plausible-looking string, without `db` taking a position on hashing policy.
 *
 * Without the first test the failure mode is an integration suite that cannot sign in and no
 * test that says why, which is exactly the outcome worth spending a test on.
 *
 * **Format.** The one `PasswordService` writes and reads:
 * `$scrypt$ln=<log2 N>,r=<r>,p=<p>,dk=<key length>$<salt>$<digest>`, PHC-style, salt and
 * digest base64 without padding. Parameters are OWASP's N=2^17, r=8, p=1 (`ln=17`), the ones
 * `.ai/specs/2026-09-04-accounts-and-roles.md` fixes, over a 16-byte salt and a 32-byte
 * digest. The value below was produced by calling that service's own `hash`, not by
 * reconstructing the string here.
 *
 * **Regenerating**, should the encoding ever change: hash `SEED_PASSWORD` with the real
 * `PasswordService.hash` and paste the result into `SEED_PASSWORD_HASH`. Keep the two values
 * in step — the plaintext is what the harness types into the form, and the guard test is
 * what tells you they have come apart.
 *
 * **This is not a secret and must never look like one.** It is the password for the
 * `mock-*@devmentor.test` fixtures on a throwaway database: obviously fake, published in the
 * repository, and useless anywhere real. No deployment seeds these rows.
 */

/**
 * The plaintext the seeded personas' hash was produced from — the password
 * `tests/integration` types into the sign-in form, and the one to use when signing in as
 * `mock-mentee@devmentor.test` or `mock-operator@devmentor.test` locally.
 *
 * 26 characters, so it satisfies `registerSchema`'s 12-character minimum and 72-byte cap and
 * can be re-registered as well as verified.
 */
export const SEED_PASSWORD = 'mock-password-not-a-secret';

/**
 * `SEED_PASSWORD` hashed with `scrypt` at the parameters `PasswordService` uses. Written to
 * `users.password_hash` for the personas that carry a password; see the file docblock for
 * the format, the guard tests, and how to regenerate it.
 */
export const SEED_PASSWORD_HASH =
  '$scrypt$ln=17,r=8,p=1,dk=32$yqJF24Lca/ynF1oLBXj3Pg$VQI/jNSlZf2P+rEAvFFO+Ss7fpL/64gKancF+ny26uU';
