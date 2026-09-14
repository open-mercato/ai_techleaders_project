import { z } from 'zod';

/**
 * Which notification to mark read. Shape only — whether it is the caller's own is the
 * service's decision, and the one that matters.
 */
export const notificationReadSchema = z.object({
  id: z.string().uuid(),
});

export type NotificationReadInput = z.infer<typeof notificationReadSchema>;
