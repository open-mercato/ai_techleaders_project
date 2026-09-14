import { describe, expect, it } from 'vitest';
import { entities } from '../index';
import { ProcessedWebhookEvent } from './processed-webhook-event.entity';

const meta = ProcessedWebhookEvent.init().meta;
const properties = meta.properties;

describe('ProcessedWebhookEvent entity', () => {
  it('records only what an exactly-once check needs', () => {
    expect(meta.className).toBe('ProcessedWebhookEvent');
    expect(meta.tableName).toBe('processed_webhook_events');
    expect(Object.keys(properties).sort()).toEqual([
      'createdAt',
      'eventId',
      'id',
      'receivedAt',
      'type',
      'updatedAt',
    ]);
  });

  it('is registered for ORM discovery', () => {
    expect(entities).toContain(ProcessedWebhookEvent);
  });

  it('makes the provider event id unique, which is what makes a redelivery a no-op', () => {
    expect(properties.eventId!.unique).toBe(true);
    expect(properties.eventId!.nullable).toBeFalsy();
    expect(properties.eventId!.length).toBe(120);
  });

  it('keeps the event type, so an ignored delivery is tellable from a missing one', () => {
    expect(properties.type!.nullable).toBeFalsy();
    expect(properties.receivedAt!.nullable).toBeFalsy();
  });
});
