import { z } from 'zod';
import { SessionLengths } from '../../domain/vocabularies/session-lengths';

/**
 * Shape-only validation. The lead time, whether the slot is still free and whether the
 * mentor is bookable are server-time policy and belong to `BookingService`.
 *
 * **There is no price field, and adding one would be a defect.** The amount is read from
 * the mentor's stored price for the chosen length (R08); a client-supplied price is a
 * client-chosen price.
 *
 * `lengthMinutes` is a number on the wire because that is what the caller means, and it is
 * checked against the same `SessionLengths` vocabulary the rest of the product uses, so
 * adding a third length is one edit there rather than a literal union repeated here.
 */
export const bookingCreateSchema = z.object({
  slotId: z.string().uuid(),
  lengthMinutes: z
    .number()
    .int()
    .refine(
      (minutes) => SessionLengths.values.includes(String(minutes) as never),
      { message: `Choose a session length of ${SessionLengths.values.join(' or ')} minutes.` },
    ),
});

export type BookingCreateInput = z.infer<typeof bookingCreateSchema>;
