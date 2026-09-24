import { describe, expect, it, vi } from 'vitest';
import {
  MentorProfile,
  Slot,
  UniqueConstraintViolationException,
  type EntityManager,
  type IMentorProfile,
  type ISlot,
  type IUser,
} from '@devmentor/db';
import type { Session } from '../../http/auth';
import { ForbiddenError, NotFoundError, UnauthorizedError } from '../../http/errors';
import { MAX_ACTIVE_SLOTS, SlotService } from './slot.service';

const NOW = new Date('2026-09-10T12:00:00.000Z');
const USER_ID = '10000000-0000-4000-8000-000000000001';
const PROFILE_ID = '30000000-0000-4000-8000-000000000001';
const SLOT_ID = '40000000-0000-4000-8000-000000000001';

function user(overrides: Partial<IUser> = {}): IUser {
  return {
    id: USER_ID,
    email: 'ada@devmentor.test',
    displayName: 'Ada Lovelace',
    roles: ['mentee', 'mentor'],
    sessionVersion: 0,
    emailVerifiedAt: NOW,
    mentorProfile: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as IUser;
}

function profile(overrides: Partial<IMentorProfile> = {}): IMentorProfile {
  return {
    id: PROFILE_ID,
    user: user(),
    headline: '',
    bio: null,
    yearsOfExperience: 0,
    initialPublishDueAt: null,
    slug: null,
    publicWorkUrl: null,
    stackTags: [],
    publishedAt: null,
    lastPublishedAvailabilityAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as IMentorProfile;
}

function slot(startsAt: Date, overrides: Partial<ISlot> = {}): ISlot {
  return {
    id: SLOT_ID,
    mentorProfile: profile(),
    startsAt,
    removedAt: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as ISlot;
}

function uniqueViolation(constraint?: string): UniqueConstraintViolationException {
  const error = Object.create(UniqueConstraintViolationException.prototype) as
    UniqueConstraintViolationException & { code: string; constraint?: string };
  error.code = '23505';
  if (constraint !== undefined) error.constraint = constraint;
  return error;
}

function makeHarness({
  session = { userId: USER_ID, roles: ['mentee', 'mentor'] },
  storedProfile = profile(),
  slots = [],
  activeSlotCount = 0,
}: {
  session?: Session | null | Promise<Session | null>;
  storedProfile?: IMentorProfile | null;
  slots?: ISlot[];
  activeSlotCount?: number;
} = {}) {
  let createdSlot: ISlot | null = null;
  const tx = {
    findOne: vi.fn(async (entity: unknown) =>
      entity === MentorProfile ? storedProfile : slots[0] ?? null,
    ),
    count: vi.fn(async () => activeSlotCount),
    create: vi.fn((_entity: unknown, data: Record<string, unknown>) => {
      createdSlot = slot(data.startsAt as Date, {
        mentorProfile: data.mentorProfile as IMentorProfile,
        removedAt: data.removedAt as Date | null,
      });
      return createdSlot;
    }),
    persist: vi.fn(),
    flush: vi.fn(async () => undefined),
  };
  const em = {
    findOne: vi.fn(async () => storedProfile),
    find: vi.fn(async () => slots),
    transactional: vi.fn(async (run: (inner: typeof tx) => unknown) => run(tx)),
  };
  const eventBus = { emit: vi.fn(async () => undefined) };
  const sessionPromise = session instanceof Promise ? session : Promise.resolve(session);
  const clock = { now: vi.fn(() => NOW) };
  const service = new SlotService({
    em: em as unknown as EntityManager,
    clock,
    eventBus: eventBus as never,
    session: sessionPromise,
  });
  return {
    service,
    em,
    tx,
    eventBus,
    clock,
    storedProfile,
    get createdSlot() {
      return createdSlot;
    },
  };
}

describe('SlotService owner reads', () => {
  it('lists active owner slots with one authoritative inclusive future-state snapshot', async () => {
    const slots = [
      slot(new Date('2026-09-10T11:59:59.999Z')),
      slot(NOW, { id: `${SLOT_ID.slice(0, -1)}2` }),
      slot(new Date('2026-09-10T14:00:00.000Z'), { id: `${SLOT_ID.slice(0, -1)}3` }),
    ];
    const h = makeHarness({ slots });

    await expect(h.service.listOwner()).resolves.toEqual([
      { id: SLOT_ID, startsAt: '2026-09-10T11:59:59.999Z', isFuture: false },
      { id: `${SLOT_ID.slice(0, -1)}2`, startsAt: NOW.toISOString(), isFuture: true },
      { id: `${SLOT_ID.slice(0, -1)}3`, startsAt: '2026-09-10T14:00:00.000Z', isFuture: true },
    ]);
    expect(h.clock.now).toHaveBeenCalledOnce();
    expect(h.em.findOne).toHaveBeenCalledWith(MentorProfile, { user: USER_ID });
    expect(h.em.find).toHaveBeenCalledWith(
      Slot,
      { mentorProfile: PROFILE_ID, removedAt: null },
      { orderBy: { startsAt: 'asc' }, limit: MAX_ACTIVE_SLOTS },
    );
  });

  it('requires an authenticated mentor with an owner profile', async () => {
    await expect(makeHarness({ session: null }).service.listOwner()).rejects.toThrow(
      UnauthorizedError,
    );
    await expect(
      makeHarness({ session: { userId: USER_ID, roles: ['mentee'] } }).service.listOwner(),
    ).rejects.toThrow(ForbiddenError);
    await expect(makeHarness({ storedProfile: null }).service.listOwner()).rejects.toThrow(
      NotFoundError,
    );
    const failure = new Error('session lookup failed');
    await expect(
      makeHarness({ session: Promise.reject(failure) }).service.listOwner(),
    ).rejects.toBe(failure);
  });
});

describe('SlotService publication', () => {
  it('publishes under the profile lock, advances the ordering key and emits after commit', async () => {
    const h = makeHarness();
    await expect(
      h.service.publish({ startsAt: '2026-09-10T14:00:00.000Z' }),
    ).resolves.toEqual({ id: SLOT_ID, startsAt: '2026-09-10T14:00:00.000Z', isFuture: true });

    expect(h.tx.findOne).toHaveBeenCalledWith(
      MentorProfile,
      { user: USER_ID },
      { lockMode: expect.anything() },
    );
    expect(h.createdSlot?.mentorProfile).toBe(h.storedProfile);
    expect(h.tx.count).toHaveBeenCalledWith(Slot, {
      mentorProfile: PROFILE_ID,
      removedAt: null,
    });
    expect(h.storedProfile?.lastPublishedAvailabilityAt).toBe(NOW);
    expect(h.tx.persist).toHaveBeenCalledWith(h.createdSlot);
    expect(h.tx.flush).toHaveBeenCalledOnce();
    expect(h.eventBus.emit).toHaveBeenCalledWith('availability.slot.published', {
      mentorProfileId: PROFILE_ID,
      slotId: SLOT_ID,
      startsAt: '2026-09-10T14:00:00.000Z',
    });
  });

  it('accepts a start exactly at now because it is not in the past', async () => {
    await expect(
      makeHarness().service.publish({ startsAt: NOW.toISOString() }),
    ).resolves.toMatchObject({ startsAt: NOW.toISOString() });
  });

  it('serializes and refuses publication at the active-slot cap', async () => {
    const h = makeHarness({ activeSlotCount: MAX_ACTIVE_SLOTS });

    await expect(h.service.publish({ startsAt: NOW.toISOString() })).rejects.toMatchObject({
      code: 'validation_failed',
      message: `You can publish up to ${MAX_ACTIVE_SLOTS} active times.`,
      fieldErrors: { startsAt: ['Remove an existing time before publishing another.'] },
    });
    expect(h.tx.create).not.toHaveBeenCalled();
    expect(h.tx.flush).not.toHaveBeenCalled();
  });

  it('accepts the last active slot before the cap', async () => {
    await expect(
      makeHarness({ activeSlotCount: MAX_ACTIVE_SLOTS - 1 }).service.publish({
        startsAt: NOW.toISOString(),
      }),
    ).resolves.toMatchObject({ id: SLOT_ID });
  });

  it('refuses a past start before opening a transaction', async () => {
    const h = makeHarness();
    await expect(
      h.service.publish({ startsAt: '2026-09-10T11:59:59.999Z' }),
    ).rejects.toMatchObject({
      code: 'validation_failed',
      fieldErrors: { startsAt: ['Choose a start time that has not passed.'] },
    });
    expect(h.em.transactional).not.toHaveBeenCalled();
  });

  it('requires the owner profile inside the publication transaction', async () => {
    await expect(
      makeHarness({ storedProfile: null }).service.publish({ startsAt: NOW.toISOString() }),
    ).rejects.toThrow(NotFoundError);
  });

  it('maps only the active-slot constraint race to conflict', async () => {
    const h = makeHarness();
    h.tx.flush.mockRejectedValueOnce(
      uniqueViolation('slots_active_mentor_profile_starts_at_unique'),
    );
    await expect(h.service.publish({ startsAt: NOW.toISOString() })).rejects.toMatchObject({
      code: 'conflict',
      message: 'This start time is already published.',
    });
    expect(h.eventBus.emit).not.toHaveBeenCalled();
  });

  it('maps a duplicate from another module graph without relying on class identity', async () => {
    const h = makeHarness();
    const foreignDriverError = Object.assign(new Error('duplicate key'), {
      code: '23505',
      constraint: 'slots_active_mentor_profile_starts_at_unique',
    });
    h.tx.flush.mockRejectedValueOnce(foreignDriverError);

    await expect(h.service.publish({ startsAt: NOW.toISOString() })).rejects.toMatchObject({
      code: 'conflict',
      message: 'This start time is already published.',
    });
  });

  it.each([
    new Error('database unavailable'),
    'database unavailable',
    null,
    uniqueViolation(),
    uniqueViolation('some_other_unique'),
    Object.assign(new Error('wrong database code'), {
      code: '23503',
      constraint: 'slots_active_mentor_profile_starts_at_unique',
    }),
  ])('does not disguise an unrelated publication failure', async (failure) => {
    const h = makeHarness();
    h.tx.flush.mockRejectedValueOnce(failure);
    await expect(h.service.publish({ startsAt: NOW.toISOString() })).rejects.toBe(failure);
  });
});

describe('SlotService removal', () => {
  it('locks and soft-removes only an active slot owned by the caller', async () => {
    const owned = slot(new Date('2026-09-10T14:00:00.000Z'));
    const h = makeHarness({ slots: [owned] });
    await expect(h.service.remove(SLOT_ID)).resolves.toEqual({ id: SLOT_ID });
    expect(h.tx.findOne).toHaveBeenCalledWith(
      Slot,
      { id: SLOT_ID, mentorProfile: { user: USER_ID }, removedAt: null },
      { lockMode: expect.anything() },
    );
    expect(owned.removedAt).toBe(NOW);
    expect(h.tx.flush).toHaveBeenCalledOnce();
  });

  it('does not reveal whether a slot is absent, removed, or belongs to another owner', async () => {
    const h = makeHarness({ slots: [] });
    await expect(h.service.remove(SLOT_ID)).rejects.toThrow(NotFoundError);
    expect(h.tx.flush).not.toHaveBeenCalled();
    expect(h.tx.findOne).toHaveBeenCalledWith(
      Slot,
      expect.objectContaining({ mentorProfile: { user: USER_ID } }),
      expect.anything(),
    );
  });
});

describe('SlotService public reads', () => {
  it('returns active future slots in start order', async () => {
    const first = slot(new Date('2026-09-10T15:00:00.000Z'));
    const second = slot(new Date('2026-09-10T16:00:00.000Z'), {
      id: `${SLOT_ID.slice(0, -1)}2`,
    });
    const h = makeHarness({ slots: [first, second] });

    await expect(h.service.listPublic(PROFILE_ID)).resolves.toEqual([
      { id: SLOT_ID, startsAt: '2026-09-10T15:00:00.000Z', meetsLeadTime: true },
      {
        id: `${SLOT_ID.slice(0, -1)}2`,
        startsAt: '2026-09-10T16:00:00.000Z',
        meetsLeadTime: true,
      },
    ]);
    expect(h.em.find).toHaveBeenCalledWith(
      Slot,
      { mentorProfile: PROFILE_ID, removedAt: null, startsAt: { $gte: NOW } },
      { orderBy: { startsAt: 'asc' }, limit: MAX_ACTIVE_SLOTS },
    );
  });
});
