import { z } from 'zod';

/**
 * Shared validation for creating a user. Imported by the API route (server-side
 * validation via `makeCrudRoute`) and by the client `CrudForm` — one schema, two
 * call sites, never redefined.
 */
export const userCreateSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1, 'Name is required').max(120),
});

export type UserCreateInput = z.infer<typeof userCreateSchema>;
