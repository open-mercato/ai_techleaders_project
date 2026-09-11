import { z } from 'zod';

/** Shape-only validation; configured price policy remains a server-side service decision. */
export const exactMajorDecimalString = z
  .string()
  .max(11)
  .regex(/^(0|[1-9]\d*)(?:\.\d{1,2})?$/);

export const mentorPricesUpdateSchema = z
  .object({
    price25: exactMajorDecimalString,
    price50: exactMajorDecimalString,
  })
  .strict();

export type MentorPricesUpdateInput = z.infer<typeof mentorPricesUpdateSchema>;
