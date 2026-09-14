import { describe, expect, it } from 'vitest';
import { notificationReadSchema } from './notification-read.schema';

const ID = '60000000-0000-4000-8000-000000000001';

describe('notificationReadSchema', () => {
  it('accepts one notification id', () => {
    expect(notificationReadSchema.parse({ id: ID })).toEqual({ id: ID });
  });

  it.each([{}, { id: 'not-a-uuid' }, { id: 1 }])('rejects %j', (input) => {
    expect(notificationReadSchema.safeParse(input).success).toBe(false);
  });

  it('strips a user id rather than carrying one', () => {
    // Ownership is the service's decision, from the session. A caller-supplied user id
    // would be an authorization input.
    expect(notificationReadSchema.parse({ id: ID, userId: 'someone-else' })).toEqual({ id: ID });
  });
});
