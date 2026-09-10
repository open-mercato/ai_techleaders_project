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
import { SlotService } from './slot.service';

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
    UniqueConstraintViolationException & { constraint?: string };
  if (constraint !== undefined) error.constraint = constraint;
  return error;
}

function makeHarness({
  session = { userId: USER_ID, roles: ['mentee', 'mentor'] },
  storedProfile = profile(),
  slots = [],
}: {
  session?: Session | null | Promise<Session | null>;
  storedProfile?: IMentorProfile | null;
  slots?: ISlot[];
} = {}) {
  let createdSlot: ISlot | null = null;
  const tx = {
    findOne: vi.fn(async (entity: unknown) =>
      entity === MentorProfile ? storedProfile : slots[0] ?? null,
    ),
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
  const service = new SlotService({
    em: em as unknown as EntityManager,
    clock: { now: () => NOW },
    eventBus: eventBus as never,
    session: sessionPromise,
  });
  return {
    service,
    em,
    tx,
    eventBus,
    storedProfile,
    get createdSlot() {
      return createdSlot;
    },
  };
}

describe('SlotService owner reads', () => {
  it('lists active owner slots in chronological query order as DTOs', async () => {
    const slots = [
      slot(new Date('2026-09-10T13:00:00.000Z')),
      slot(new Date('2026-09-10T14:00:00.000Z'), { id: `${SLOT_ID.slice(0, -1)}2` }),
    ];
    const h = makeHarness({ slots });

    await expect(h.service.listOwner()).resolves.toEqual([
      { id: SLOT_ID, startsAt: '2026-09-10T13:00:00.000Z' },
      { id: `${SLOT_ID.slice(0, -1)}2`, startsAt: '2026-09-10T14:00:00.000Z' },
    ]);
    expect(h.em.findOne).toHaveBeenCalledWith(MentorProfile, { user: USER_ID });
    expect(h.em.find).toHaveBeenCalledWith(
      Slot,
      { mentorProfile: PROFILE_ID, removedAt: null },
      { orderBy: { startsAt: 'asc' } },
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
    ).resolves.toEqual({ id: SLOT_ID, startsAt: '2026-09-10T14:00:00.000Z' });

    expect(h.tx.findOne).toHaveBeenCalledWith(
      MentorProfile,
      { user: USER_ID },
      { lockMode: expect.anything() },
    );
    expect(h.createdSlot?.mentorProfile).toBe(h.storedProfile);
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

  it.each([
    new Error('database unavailable'),
    uniqueViolation(),
    uniqueViolation('some_other_unique'),
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
  it('returns active future slots and applies the exact inclusive two-hour boundary', async () => {
    const beforeBoundary = slot(new Date('2026-09-10T13:59:59.999Z'));
    const exactBoundary = slot(new Date('2026-09-10T14:00:00.000Z'), {
      id: `${SLOT_ID.slice(0, -1)}2`,
    });
    const h = makeHarness({ slots: [beforeBoundary, exactBoundary] });

    await expect(h.service.listPublic(PROFILE_ID)).resolves.toEqual([
      { id: SLOT_ID, startsAt: '2026-09-10T13:59:59.999Z', meetsLeadTime: false },
      {
        id: `${SLOT_ID.slice(0, -1)}2`,
        startsAt: '2026-09-10T14:00:00.000Z',
        meetsLeadTime: true,
      },
    ]);
    expect(h.em.find).toHaveBeenCalledWith(
      Slot,
      { mentorProfile: PROFILE_ID, removedAt: null, startsAt: { $gte: NOW } },
      { orderBy: { startsAt: 'asc' } },
    );
  });
});
