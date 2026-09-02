import type { Logger } from '../logger';
import type { EventId, EventMap } from './event-map';

export type EventHandler<K extends EventId> = (payload: EventMap[K]) => void | Promise<void>;

type AnyHandler = (payload: EventMap[EventId]) => void | Promise<void>;

/**
 * Lightweight typed, in-process event emitter. Registered as a singleton on the
 * `Cradle`. A failing handler is logged and swallowed so one bad subscriber can't
 * break the mutation that emitted the event.
 */
export class EventBus {
  private readonly handlers = new Map<EventId, Set<AnyHandler>>();
  private readonly logger: Logger;

  constructor({ logger }: { logger: Logger }) {
    this.logger = logger;
  }

  /** Subscribe to an event. Returns an unsubscribe function. */
  on<K extends EventId>(event: K, handler: EventHandler<K>): () => void {
    const set = this.handlers.get(event) ?? new Set<AnyHandler>();
    set.add(handler as AnyHandler);
    this.handlers.set(event, set);
    return () => {
      set.delete(handler as AnyHandler);
    };
  }

  /** Emit an event, awaiting each handler in turn. */
  async emit<K extends EventId>(event: K, payload: EventMap[K]): Promise<void> {
    const handlers = this.handlers.get(event);
    if (!handlers?.size) {
      return;
    }
    for (const handler of handlers) {
      try {
        await handler(payload);
      } catch (error) {
        this.logger.error({ err: error, event }, 'event handler failed');
      }
    }
  }
}
