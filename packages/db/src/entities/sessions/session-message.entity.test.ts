import type { EntityProperty } from '@mikro-orm/core';
import { describe, expect, it } from 'vitest';
import { entities } from '../index';
import { Booking } from '../bookings/booking.entity';
import { User } from '../auth/user.entity';
import { MAX_MESSAGE_LENGTH, SessionMessage } from './session-message.entity';

function typeName(property: EntityProperty): string {
  const { type } = property as unknown as { type: string | { name: string } };
  return typeof type === 'string' ? type : type.name;
}

const meta = SessionMessage.init().meta;
const properties = meta.properties;

describe('SessionMessage entity', () => {
  it('maps one message and nothing about the session as a whole', () => {
    expect(meta.className).toBe('SessionMessage');
    expect(meta.tableName).toBe('session_messages');
    expect(Object.keys(properties).sort()).toEqual([
      'author',
      'body',
      'booking',
      'createdAt',
      'id',
      'updatedAt',
    ]);
    // A session's state is arithmetic on the booking, so there is deliberately nothing here
    // that stores it. If any of these ever appears, the clock stopped being the authority.
    expect(properties).not.toHaveProperty('status');
    expect(properties).not.toHaveProperty('endedAt');
    expect(properties).not.toHaveProperty('readAt');
  });

  it('is registered for ORM discovery', () => {
    expect(entities).toContain(SessionMessage);
  });

  it('goes with the booking it belongs to and holds the author row back', () => {
    expect(properties.booking.kind).toBe('m:1');
    expect(properties.booking.nullable).toBeFalsy();
    expect(properties.booking.deleteRule).toBe('cascade');
    expect(properties.booking.entity).toBeDefined();
    expect(Booking.meta.className).toBe('Booking');

    // Restrict rather than cascade: half a transcript is worse than a refused delete.
    expect(properties.author.kind).toBe('m:1');
    expect(properties.author.nullable).toBeFalsy();
    expect(properties.author.deleteRule).toBe('restrict');
    expect(User.meta.className).toBe('User');
  });

  it('stores the body as unbounded text and bounds it with a check instead', () => {
    expect(typeName(properties.body)).toBe('TextType');
    expect(properties.body.nullable).toBeFalsy();
    expect(MAX_MESSAGE_LENGTH).toBe(4000);
    expect(meta.checks).toEqual([
      {
        name: 'session_messages_body_length',
        expression: 'length("body") between 1 and 4000',
      },
    ]);
  });

  it('indexes the only query a transcript makes, in created order', () => {
    expect(meta.indexes).toEqual([
      {
        name: 'session_messages_booking_created_at_index',
        properties: ['booking', 'createdAt'],
      },
    ]);
    expect(meta.uniques).toEqual([]);
  });
});
