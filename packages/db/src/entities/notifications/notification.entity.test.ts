import { describe, expect, it } from 'vitest';
import { entities } from '../index';
import { Notification } from './notification.entity';
import { NOTIFICATION_KINDS } from './notification-kind';

const meta = Notification.init().meta;
const properties = meta.properties;

describe('Notification entity', () => {
  it('maps one message to one person, optionally about one booking', () => {
    expect(meta.className).toBe('Notification');
    expect(meta.tableName).toBe('notifications');
    expect(Object.keys(properties).sort()).toEqual([
      'booking',
      'createdAt',
      'id',
      'kind',
      'readAt',
      'updatedAt',
      'user',
    ]);
  });

  it('is registered for ORM discovery', () => {
    expect(entities).toContain(Notification);
  });

  it('goes with the record it is about, unlike the booking itself', () => {
    // A notification is a message *about* a record, not the record, so a dangling message
    // would be worse than a lost one. Booking's relations restrict; these cascade.
    expect(properties.user!.deleteRule).toBe('cascade');
    expect(properties.user!.nullable).toBeFalsy();
    expect(properties.booking!.deleteRule).toBe('cascade');
    expect(properties.booking!.nullable).toBe(true);
  });

  it('starts unread and constrains the kind to the known list', () => {
    expect(properties.readAt!.nullable).toBe(true);
    expect(properties.kind!.items).toEqual([...NOTIFICATION_KINDS]);
    expect(properties.kind!.nullable).toBeFalsy();
  });

  it('indexes the only query this table has', () => {
    expect(meta.indexes).toEqual([
      { name: 'notifications_user_read_at_index', properties: ['user', 'readAt'] },
    ]);
  });
});
