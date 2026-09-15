import { MAX_MESSAGE_LENGTH } from '@devmentor/db';
import { describe, expect, it } from 'vitest';
import { messageCreateSchema } from './message-create.schema';

describe('messageCreateSchema', () => {
  it('accepts a message and stores it trimmed', () => {
    expect(messageCreateSchema.parse({ body: '  Where should I validate it?  ' })).toEqual({
      body: 'Where should I validate it?',
    });
  });

  it('accepts a body of exactly the bound the table allows', () => {
    const body = 'x'.repeat(MAX_MESSAGE_LENGTH);

    expect(messageCreateSchema.parse({ body })).toEqual({ body });
  });

  it.each([
    { case: 'missing', input: {} },
    { case: 'empty', input: { body: '' } },
    { case: 'whitespace only', input: { body: '   \n\t ' } },
    { case: 'not a string', input: { body: 42 } },
    { case: 'one character over the bound', input: { body: 'x'.repeat(MAX_MESSAGE_LENGTH + 1) } },
  ])('refuses a body that is $case', ({ input }) => {
    expect(messageCreateSchema.safeParse(input).success).toBe(false);
  });

  it('says what to do about each refusal', () => {
    const empty = messageCreateSchema.safeParse({ body: '  ' });
    const long = messageCreateSchema.safeParse({ body: 'x'.repeat(MAX_MESSAGE_LENGTH + 1) });

    expect(empty.error?.issues[0]?.message).toBe('Write a message before sending it.');
    expect(long.error?.issues[0]?.message).toBe('Keep a message to 4,000 characters or fewer.');
  });

  it('strips fields outside the request contract', () => {
    expect(messageCreateSchema.parse({ body: 'Hello', authorId: 'someone-else' })).toEqual({
      body: 'Hello',
    });
  });
});
