import type {
  Cradle,
  MessageCreateInput,
  OwnedCollectionRouteOptions,
  SessionMessageDto,
} from '@devmentor/core';
import { ConflictError, messageCreateSchema } from '@devmentor/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  options: undefined as
    | OwnedCollectionRouteOptions<SessionMessageDto, MessageCreateInput>
    | undefined,
  postMessage: vi.fn(),
}));

vi.mock('@devmentor/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@devmentor/core')>()),
  makeOwnedCollectionRoute: (
    options: OwnedCollectionRouteOptions<SessionMessageDto, MessageCreateInput>,
  ) => {
    state.options = options;
    return { GET: 'COLLECTION_GET', POST: 'POST' };
  },
}));

const route = await import('./route');
const cradle = {
  textSessionService: { postMessage: state.postMessage },
} as unknown as Cradle;
const BOOKING_ID = '50000000-0000-4000-8000-000000000001';

function options(): OwnedCollectionRouteOptions<SessionMessageDto, MessageCreateInput> {
  if (state.options === undefined) throw new Error('route.ts did not configure its collection');
  return state.options;
}

function request(): Request {
  return new Request(`https://devmentor.test/api/sessions/${BOOKING_ID}/messages`, {
    method: 'POST',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  state.postMessage.mockResolvedValue({
    id: 'm-1',
    authorId: 'mentee-id',
    authorName: 'Jamie Chen',
    body: 'That helps.',
    createdAt: '2026-09-14T16:20:00.000Z',
  });
});

describe('POST /api/sessions/[bookingId]/messages', () => {
  it('exposes only POST, so the transcript has one read path', () => {
    expect(route.dynamic).toBe('force-dynamic');
    expect(route.POST).toBe('POST');
    expect(route).not.toHaveProperty('GET');
  });

  it('asks for no role and validates only the body shape', () => {
    expect(options().role).toBeUndefined();
    expect(options().createSchema).toBe(messageCreateSchema);
    expect(options().list).toBeUndefined();
  });

  it('posts the validated body into the session named in the address', async () => {
    await expect(
      options().create?.(request(), cradle, { bookingId: BOOKING_ID }, { body: 'That helps.' }),
    ).resolves.toMatchObject({ body: 'That helps.', authorName: 'Jamie Chen' });
    expect(state.postMessage).toHaveBeenCalledExactlyOnceWith(BOOKING_ID, {
      body: 'That helps.',
    });
  });

  it('refuses an address with no booking id, before reaching the service', async () => {
    await expect(
      options().create?.(request(), cradle, undefined, { body: 'Hello' }),
    ).rejects.toMatchObject({ code: 'not_found' });
    expect(state.postMessage).not.toHaveBeenCalled();
  });

  it('passes a closed-window refusal through for the envelope mapper', async () => {
    const conflict = new ConflictError('This session has not started yet.');
    state.postMessage.mockRejectedValue(conflict);

    await expect(
      options().create?.(request(), cradle, { bookingId: BOOKING_ID }, { body: 'Early' }),
    ).rejects.toBe(conflict);
  });
});
