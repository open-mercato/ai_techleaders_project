import { z } from 'zod';
import {
  emailSchema,
  isWithinPasswordByteCap,
  PASSWORD_MIN_CHARACTERS,
  PASSWORD_TOO_LONG_MESSAGE,
  PASSWORD_TOO_SHORT_MESSAGE,
  returnToSchema,
} from './fields';

/**
 * The body of `POST /api/auth/register` — one schema, two call sites. The route parses
 * the request with it through `apiHandler`, and the sign-up `CrudForm` validates with the
 * same object before it sends anything. `packages/ui` depends on `zod` directly so a
 * schema can cross that boundary without `ui` importing `core`.
 *
 * A failure becomes `422 validation_failed` carrying `fieldErrors` keyed by field name —
 * `{ email: ['Enter a valid email address.'] }` — which is the shape `CrudForm` renders
 * under the matching input, and `_root` for anything that is not an object at all.
 *
 * Unknown keys are dropped rather than rejected, which is what keeps a posted
 * `roles: ['operator']` from reaching the service at all.
 */

/**
 * 120 characters, and trimmed before it is counted.
 *
 * The trim is not cosmetic: `'   '` clears a bare `.min(1)` and then renders as an empty
 * name everywhere the workspace chrome shows one. Normalising here is safe in a way it is
 * not for `email` — a display name is presentation, not the key any row is found by, so
 * nothing else in the system has to agree about its spelling.
 */
const displayNameSchema = z
  .string({ error: 'Enter the name you want other people to see.' })
  .trim()
  .min(1, 'Enter the name you want other people to see.')
  .max(120, 'This name is too long. The limit is 120 characters.');

export const registerSchema = z.object({
  email: emailSchema,
  // The `error` option covers the one issue the checks below cannot: a body with no
  // `password` key at all. Zod's default for it reads "Invalid input: expected string,
  // received undefined", and `CrudForm` renders whatever comes back verbatim.
  password: z
    .string({ error: 'Choose a password.' })
    .min(PASSWORD_MIN_CHARACTERS, PASSWORD_TOO_SHORT_MESSAGE)
    .refine(isWithinPasswordByteCap, PASSWORD_TOO_LONG_MESSAGE),
  displayName: displayNameSchema,
  returnTo: returnToSchema,
});

export type RegisterInput = z.infer<typeof registerSchema>;
