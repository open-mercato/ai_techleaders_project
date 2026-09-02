/**
 * Registry of domain events. Event IDs follow `concept.entity.action` (past tense);
 * the value type is the event's payload. Add an entry here when a concept needs to
 * emit — this is the single source of truth the typed `EventBus` is generic over.
 *
 * In-process only: these drive synchronous side effects (logging, sending a message,
 * cache invalidation). There is no queue or background worker in this project.
 */
export interface EventMap {
  'auth.user.created': { userId: string; email: string };
}

export type EventId = keyof EventMap;
