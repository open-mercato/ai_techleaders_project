import { z } from 'zod';
import {
  emailSchema,
  isWithinPasswordByteCap,
  PASSWORD_TOO_LONG_MESSAGE,
  returnToSchema,
} from './fields';

/**
 * The body of `POST /api/auth/login` — parsed by the route and by the sign-in `CrudForm`,
 * on the same terms as `registerSchema`, and producing the same `422 validation_failed`
 * with `fieldErrors` keyed by field name.
 *
 * **`password` has the byte cap and deliberately no minimum. Do not add `.min()` here to
 * match `registerSchema`.** Three reasons, and none of them is an oversight:
 *
 * 1. **It would refuse credentials that are correct.** The minimum describes passwords
 *    this product will *accept* today; the stored ones were accepted under whatever rule
 *    was in force when they were set. A seeded persona, an account that set a password
 *    before the floor moved, or the floor moving from 12 to 14 next year would each
 *    produce a user whose real password cannot be typed into the form that exists to
 *    check it. Sign-in verifies a credential, it does not re-audit policy.
 * 2. **Sign-in refuses one way.** The spec pins the refusal to a generic
 *    `401 unauthorized` — *"Invalid credentials"*, identical for an unknown address and a
 *    wrong password. A length rule adds a second, distinguishable refusal shape to the
 *    same form: a 422 naming the minimum, free to trigger without an account, which hands
 *    an enumerator the current policy and gives the response something to vary on other
 *    than "that was not it".
 * 3. **It buys nothing.** A password below the minimum cannot match a hash created under
 *    it, so the check would only move the same refusal earlier — and it moves it into the
 *    branch that answers differently.
 *
 * The cap stays, because its reason is not policy. It bounds what reaches a deliberately
 * expensive hash and its concurrency gate, it is decided from the request alone, and it
 * describes the input rather than the account.
 */
export const loginSchema = z.object({
  email: emailSchema,
  // `error` covers a body with no `password` key at all — the one refusal a schema with
  // no minimum still has to make, and the only one whose default message ("Invalid input:
  // expected string, received undefined") would reach a user through `CrudForm`.
  password: z
    .string({ error: 'Enter your password.' })
    .refine(isWithinPasswordByteCap, PASSWORD_TOO_LONG_MESSAGE),
  returnTo: returnToSchema,
});

export type LoginInput = z.infer<typeof loginSchema>;
