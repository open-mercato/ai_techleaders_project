/** Matches the `varchar(255)` column in the initial migration. */
export const MAX_MESSAGE_LENGTH = 255;

export type ValidationResult =
  | { ok: true; value: string }
  | { ok: false; error: string };

/**
 * Validates and normalises a submitted message body. Pure and dependency-free so
 * it can be unit tested without a database, and reused by both the server action
 * and any future API surface.
 */
export function validateMessageBody(input: unknown): ValidationResult {
  if (typeof input !== "string") {
    return { ok: false, error: "Message must be text." };
  }

  const value = input.trim();

  if (value.length === 0) {
    return { ok: false, error: "Message cannot be empty." };
  }

  if (value.length > MAX_MESSAGE_LENGTH) {
    return {
      ok: false,
      error: `Message must be ${MAX_MESSAGE_LENGTH} characters or fewer.`,
    };
  }

  return { ok: true, value };
}
