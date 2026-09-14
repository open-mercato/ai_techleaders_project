import { defineEntity, type InferEntity } from '@mikro-orm/core';
import { baseProperties } from '../base.entity';
import { defineSingletonEntity } from '../define';

const p = defineEntity.properties;

/**
 * One payment-provider event this process has already acted on.
 *
 * **This row is the idempotency mechanism, not a log of one.** Providers redeliver — after
 * a timeout, after a 500, and sometimes for no reason at all — so "confirm exactly once"
 * cannot be a check the handler performs and then hopes nobody repeats. The handler inserts
 * this row **first, inside the same transaction** as the confirmation it is about to write;
 * a duplicate delivery loses on `processed_webhook_events_event_id_unique` and the whole
 * transaction rolls back, having changed nothing. One booking, one charge.
 *
 * It deliberately records every verified event, including the types the product does not
 * act on: "we received it and ignored it" and "we never received it" must be tellable
 * apart when a payment is being reconciled by hand.
 */
export const ProcessedWebhookEvent = defineSingletonEntity('ProcessedWebhookEvent', () =>
  defineEntity({
    name: 'ProcessedWebhookEvent',
    tableName: 'processed_webhook_events',
    properties: {
      ...baseProperties,
      /** The provider's own event id. The unique index on it is the whole point. */
      eventId: p.string().length(120).unique(),
      type: p.string().length(80),
      receivedAt: p.datetime(),
    },
  }),
);

export type IProcessedWebhookEvent = InferEntity<typeof ProcessedWebhookEvent>;
