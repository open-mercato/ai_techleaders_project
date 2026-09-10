import { z } from 'zod';
import { defineVocabulary } from '../vocabulary';

/** The session lengths offered by the first product iteration. */
export const SessionLengths = defineVocabulary(['25', '50'] as const);

export type SessionLength = z.infer<typeof SessionLengths.schema>;
export type SessionLengthMinutes = 25 | 50;

/** Convert the string vocabulary once at a numeric domain boundary. */
export function sessionLengthMinutes(length: SessionLength): SessionLengthMinutes {
  return length === '25' ? 25 : 50;
}
