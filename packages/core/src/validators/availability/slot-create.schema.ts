import { z } from 'zod';

/** Shape-only validation; server-time policy belongs to SlotService. */
export const slotCreateSchema = z.object({
  startsAt: z.string().datetime(),
});

export type SlotCreateInput = z.infer<typeof slotCreateSchema>;
