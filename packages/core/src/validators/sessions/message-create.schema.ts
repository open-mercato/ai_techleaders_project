import { MAX_MESSAGE_LENGTH } from '@devmentor/db';
import { z } from 'zod';

/**
 * One message's shape at the HTTP boundary (#26).
 *
 * **Trimmed before it is measured**, so " " is an empty message rather than a one-character
 * one, and a body that only differs from another by trailing whitespace is stored the same
 * way it is read.
 *
 * The bound is `MAX_MESSAGE_LENGTH` from `@devmentor/db`, the same constant the table's
 * `CHECK` is generated from. Declaring `4000` here as well would be a second source of truth
 * for the same limit, and the failure mode is specific: the schema accepts a body Postgres
 * then refuses, turning a validation message into a 500.
 *
 * Whether the session is open is **not** here. That is server-time policy and belongs to
 * `SessionService`, which reads the clock.
 */
export const messageCreateSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, 'Write a message before sending it.')
    .max(MAX_MESSAGE_LENGTH, `Keep a message to ${MAX_MESSAGE_LENGTH.toLocaleString('en-GB')} characters or fewer.`),
});

export type MessageCreateInput = z.infer<typeof messageCreateSchema>;
