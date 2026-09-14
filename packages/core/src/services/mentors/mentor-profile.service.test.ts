import { describe, expect, it, vi } from 'vitest';
import {
  MentorProfile,
  Slot,
  UniqueConstraintViolationException,
  type EntityManager,
  type IMentorProfile,
  type IUser,
} from '@devmentor/db';
import type { Session } from '../../http/auth';
import type { SlotPublicDto } from '../availability/slot.service';
import type { PlatformSettings } from '../operator/platform-settings.service';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ServiceUnavailableError,
  UnauthorizedError,
} from '../../http/errors';
import {
  MAX_LISTED_MENTORS,
  MAX_SLUG_ATTEMPTS,
  MentorProfileService,
  toOwnerDto,
  toPublicDto,
} from './mentor-profile.service';

const NOW = new Date('2026-09-10T12:00:00.000Z');
const PROFILE_ID = '30000000-0000-4000-8000-000000000001';
const USER_ID = '10000000-0000-4000-8000-000000000001';
const SETTINGS: PlatformSettings = {
  currency: 'PLN',
  priceBounds: {
    p25: { minCents: 9_000, maxCents: 60_000 },
    p50: { minCents: 18_000, maxCents: 120_000 },
  },
  feePercent: 20,
};

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
    bio: 'I built compilers.',
    yearsOfExperience: 0,
    initialPublishDueAt: null,
    slug: null,
    publicWorkUrl: 'https://github.com/ada',
    stackTags: ['TypeScript'],
    publishedAt: null,
    lastPublishedAvailabilityAt: null,
    price25Cents: null,
    price50Cents: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as IMentorProfile;
}

function uniqueViolation(constraint?: string): UniqueConstraintViolationException {
  const error = Object.create(UniqueConstraintViolationException.prototype) as
    UniqueConstraintViolationException & { constraint?: string };
  if (constraint !== undefined) error.constraint = constraint;
  return error;
}

function makeHarness(
  session: Session | null | Promise<Session | null> = { userId: USER_ID, roles: ['mentee', 'mentor'] },
  stored: IMentorProfile | null = profile(),
) {
  const tx = {
    findOne: vi.fn(async () => stored),
    flush: vi.fn(async () => undefined),
  };
  const em = {
    findOne: vi.fn(async () => stored),
    transactional: vi.fn(async (run: (inner: typeof tx) => unknown) => run(tx)),
  };
  const eventBus = { emit: vi.fn(async () => undefined) };
  const slotService = { listPublic: vi.fn(async (): Promise<SlotPublicDto[]> => []) };
  const platformSettingsService = { get: vi.fn(() => SETTINGS) };
  const service = new MentorProfileService({
    em: em as unknown as EntityManager,
    clock: { now: () => NOW },
    eventBus: eventBus as never,
    session: session instanceof Promise ? session : Promise.resolve(session),
    slotService: slotService as never,
    platformSettingsService,
  });
  return { service, em, tx, eventBus, slotService, platformSettingsService, stored };
}

describe('mentor profile projections', () => {
  it('builds the exact owner shape and evaluates draft readiness', () => {
    const dto = toOwnerDto(
      profile({
        publicWorkUrl: undefined,
        bio: undefined,
        slug: 'ada',
        publishedAt: NOW,
        price25Cents: 9_000,
        price50Cents: 18_000,
      }),
      SETTINGS,
    );
    expect(Object.keys(dto).sort()).toEqual([
      'bio', 'displayName', 'id', 'offerReadiness', 'priceBounds', 'priceCurrency', 'prices', 'publicWorkUrl',
      'publishedAt', 'readiness', 'slug', 'stackTags',
    ]);
    expect(dto.publicWorkUrl).toBeNull();
    expect(dto.bio).toBeNull();
    expect(dto.slug).toBe('ada');
    expect(dto.publishedAt).toBe(NOW.toISOString());
    expect(dto.readiness.ready).toBe(false);
    expect(dto.prices).toEqual({ price25Cents: 9_000, price50Cents: 18_000, currency: 'PLN' });
    expect(dto.priceBounds).toEqual(SETTINGS.priceBounds);
    expect(dto.priceCurrency).toBe('PLN');
    expect(dto.offerReadiness?.ready).toBe(true);
  });

  it('builds the exact public allowlist without private profile or user fields', () => {
    const dto = toPublicDto(
      profile({ slug: 'ada', publishedAt: NOW, price25Cents: 9_000, price50Cents: 18_000 }),
      [],
      SETTINGS,
    );
    expect(Object.keys(dto).sort()).toEqual([
      'bio', 'displayName', 'prices', 'publicWorkUrl', 'slots', 'slug', 'stackTags',
    ]);
    expect(dto).toEqual({
      displayName: 'Ada Lovelace',
      publicWorkUrl: 'https://github.com/ada',
      bio: 'I built compilers.',
      stackTags: ['TypeScript'],
      slug: 'ada',
      slots: [],
      prices: { price25Cents: 9_000, price50Cents: 18_000, currency: 'PLN' },
    });
    expect(dto).not.toHaveProperty('priceBounds');
    expect(dto).not.toHaveProperty('publishedAt');
    expect(dto).not.toHaveProperty('initialPublishDueAt');
    expect(dto).not.toHaveProperty('email');
  });

  it('keeps the Slice 2 public projection callable without an availability argument', () => {
    expect(toPublicDto(profile({ slug: 'ada', publishedAt: NOW }))).toMatchObject({
      slug: 'ada',
      slots: [],
    });
  });

  it('keeps the Slice 2 owner projection callable without platform settings', () => {
    expect(Object.keys(toOwnerDto(profile())).sort()).toEqual([
      'bio', 'displayName', 'id', 'publicWorkUrl', 'publishedAt', 'readiness', 'slug', 'stackTags',
    ]);
  });

  it.each([
    [null, null],
    [9_000, null],
    [null, 18_000],
  ])('projects incomplete persisted prices %j/%j as null', (price25Cents, price50Cents) => {
    expect(toPublicDto(profile({ price25Cents, price50Cents }), [], SETTINGS).prices).toBeNull();
  });

  it('keeps direct Slice 2 service construction on an empty availability projection', async () => {
    const stored = profile({ slug: 'ada', publishedAt: NOW });
    const service = new MentorProfileService({
      em: { findOne: vi.fn(async () => stored) } as unknown as EntityManager,
      clock: { now: () => NOW },
      eventBus: { emit: vi.fn() } as never,
      session: Promise.resolve(null),
    });

    await expect(service.getPublicBySlug('ada')).resolves.toMatchObject({ slots: [] });
  });
});

describe('MentorProfileService owner operations', () => {
  it('reads the signed-in mentor profile with its user projection', async () => {
    const h = makeHarness();
    await expect(h.service.getOwner()).resolves.toMatchObject({ id: PROFILE_ID, displayName: 'Ada Lovelace' });
    expect(h.em.findOne).toHaveBeenCalledWith(MentorProfile, { user: USER_ID }, { populate: ['user'] });
  });

  it('requires a signed-in mentor and an existing owner profile', async () => {
    await expect(makeHarness(null).service.getOwner()).rejects.toThrow(UnauthorizedError);
    await expect(
      makeHarness({ userId: USER_ID, roles: ['mentee'] }).service.getOwner(),
    ).rejects.toThrow(ForbiddenError);
    await expect(makeHarness(undefined, null).service.getOwner()).rejects.toThrow(NotFoundError);
    const failure = new Error('session lookup failed');
    await expect(makeHarness(Promise.reject(failure)).service.getOwner()).rejects.toBe(failure);
  });

  it('updates only supplied draft fields under the profile lock', async () => {
    const h = makeHarness();
    const originalUrl = h.stored?.publicWorkUrl;
    await expect(
      h.service.update({ bio: 'New bio', stackTags: ['Python', 'AI agents'] }),
    ).resolves.toMatchObject({ bio: 'New bio', stackTags: ['Python', 'AI agents'] });
    expect(h.stored?.publicWorkUrl).toBe(originalUrl);
    expect(h.tx.flush).toHaveBeenCalledOnce();
    expect(h.tx.findOne).toHaveBeenCalledWith(
      MentorProfile,
      { user: USER_ID },
      expect.objectContaining({ populate: ['user'], lockMode: expect.anything() }),
    );
  });

  it('updates a supplied public-work link while leaving omitted fields unchanged', async () => {
    const h = makeHarness();
    await h.service.update({ publicWorkUrl: 'https://example.com/work' });
    expect(h.stored).toMatchObject({
      publicWorkUrl: 'https://example.com/work',
      bio: 'I built compilers.',
      stackTags: ['TypeScript'],
    });
  });

  it('clears nullable draft fields after blank controls normalize to null', async () => {
    const h = makeHarness();
    await h.service.update({ publicWorkUrl: null, bio: null });
    expect(h.stored).toMatchObject({ publicWorkUrl: null, bio: null });
  });

  it('will not make an already-public page incomplete', async () => {
    const h = makeHarness(undefined, profile({ slug: 'ada', publishedAt: NOW }));
    await expect(h.service.update({ stackTags: [] })).rejects.toMatchObject({
      status: 422,
      fieldErrors: { stackTags: ['Choose at least one technology.'] },
    });
    expect(h.tx.flush).not.toHaveBeenCalled();
  });

  it('treats absent persisted optional fields as null on a published update', async () => {
    const h = makeHarness(
      undefined,
      profile({ slug: 'ada', publishedAt: NOW, publicWorkUrl: undefined, bio: undefined }),
    );
    await expect(h.service.update({})).rejects.toMatchObject({
      fieldErrors: { publicWorkUrl: expect.any(Array), bio: expect.any(Array) },
    });
  });

  it('unpublishes under a lock while retaining the immutable slug', async () => {
    const h = makeHarness(undefined, profile({ slug: 'ada', publishedAt: NOW }));
    await expect(h.service.unpublish()).resolves.toMatchObject({ slug: 'ada', publishedAt: null });
    expect(h.stored?.slug).toBe('ada');
    expect(h.tx.flush).toHaveBeenCalledOnce();
  });

  it('stores both exact prices atomically under the owner lock', async () => {
    const h = makeHarness(undefined, profile({ publishedAt: NOW }));
    await expect(h.service.updatePrices({ price25: '90.00', price50: '180.00' })).resolves.toMatchObject({
      prices: { price25Cents: 9_000, price50Cents: 18_000, currency: 'PLN' },
      priceBounds: SETTINGS.priceBounds,
      offerReadiness: { ready: true },
    });
    expect(h.stored).toMatchObject({ price25Cents: 9_000, price50Cents: 18_000 });
    expect(h.tx.findOne).toHaveBeenCalledWith(
      MentorProfile,
      { user: USER_ID },
      expect.objectContaining({ lockMode: expect.anything() }),
    );
    expect(h.tx.flush).toHaveBeenCalledOnce();
  });

  it.each([
    ['90.00', '180.00'],
    ['600.00', '1200.00'],
  ])('accepts both inclusive price boundaries: %s/%s', async (price25, price50) => {
    const h = makeHarness();
    await expect(h.service.updatePrices({ price25, price50 })).resolves.toBeDefined();
    expect(h.tx.flush).toHaveBeenCalledOnce();
  });

  it.each([
    ['price25', '89.99', '180.00', 'PLN 90.00', 'PLN 600.00'],
    ['price25', '600.01', '180.00', 'PLN 90.00', 'PLN 600.00'],
    ['price50', '90.00', '179.99', 'PLN 180.00', 'PLN 1200.00'],
    ['price50', '90.00', '1200.01', 'PLN 180.00', 'PLN 1200.00'],
  ])(
    'refuses an out-of-bounds %s without starting a write transaction',
    async (field, price25, price50, minimum, maximum) => {
      const h = makeHarness();
      const error = await h.service.updatePrices({ price25, price50 }).catch((caught: unknown) => caught);
      expect(error).toMatchObject({ status: 422, fieldErrors: { [field]: [expect.stringContaining(minimum)] } });
      expect((error as { fieldErrors: Record<string, string[]> }).fieldErrors[field]?.[0]).toContain(maximum);
      expect(h.em.transactional).not.toHaveBeenCalled();
      expect(h.tx.flush).not.toHaveBeenCalled();
    },
  );

  it('rejects malformed direct service input and leaves both old prices untouched', async () => {
    const stored = profile({ price25Cents: 10_000, price50Cents: 20_000 });
    const h = makeHarness(undefined, stored);
    await expect(
      h.service.updatePrices({ price25: '100.00', price50: '180.001' }),
    ).rejects.toMatchObject({
      status: 422,
      fieldErrors: { price50: ['Enter a PLN amount with no more than two decimal places.'] },
    });
    expect(stored).toMatchObject({ price25Cents: 10_000, price50Cents: 20_000 });
    expect(h.em.transactional).not.toHaveBeenCalled();
  });

  it('keeps both previous prices when one parsed amount breaches policy', async () => {
    const stored = profile({ price25Cents: 10_000, price50Cents: 20_000 });
    const h = makeHarness(undefined, stored);
    await expect(
      h.service.updatePrices({ price25: '100.00', price50: '179.99' }),
    ).rejects.toMatchObject({ status: 422, fieldErrors: { price50: expect.any(Array) } });
    expect(stored).toMatchObject({ price25Cents: 10_000, price50Cents: 20_000 });
    expect(h.em.transactional).not.toHaveBeenCalled();
    expect(h.tx.flush).not.toHaveBeenCalled();
  });

  it('requires authorization before resolving policy and requires an existing owner profile', async () => {
    const signedOut = makeHarness(null);
    await expect(
      signedOut.service.updatePrices({ price25: '90.00', price50: '180.00' }),
    ).rejects.toThrow(UnauthorizedError);
    expect(signedOut.platformSettingsService.get).not.toHaveBeenCalled();

    const mentee = makeHarness({ userId: USER_ID, roles: ['mentee'] });
    await expect(
      mentee.service.updatePrices({ price25: '90.00', price50: '180.00' }),
    ).rejects.toThrow(ForbiddenError);
    expect(mentee.platformSettingsService.get).not.toHaveBeenCalled();

    await expect(
      makeHarness(undefined, null).service.updatePrices({ price25: '90.00', price50: '180.00' }),
    ).rejects.toThrow(NotFoundError);
  });

  it('fails closed without settings and propagates policy failures before mutation', async () => {
    const stored = profile({ price25Cents: 10_000, price50Cents: 20_000 });
    const service = new MentorProfileService({
      em: { transactional: vi.fn() } as unknown as EntityManager,
      clock: { now: () => NOW },
      eventBus: { emit: vi.fn() } as never,
      session: Promise.resolve({ userId: USER_ID, roles: ['mentor'] }),
    });
    await expect(service.updatePrices({ price25: '90.00', price50: '180.00' })).rejects.toMatchObject({
      status: 503,
    });

    const h = makeHarness(undefined, stored);
    const unavailable = new Error('policy unavailable');
    h.platformSettingsService.get.mockImplementationOnce(() => { throw unavailable; });
    await expect(h.service.updatePrices({ price25: '90.00', price50: '180.00' })).rejects.toBe(unavailable);
    expect(stored).toMatchObject({ price25Cents: 10_000, price50Cents: 20_000 });
    expect(h.em.transactional).not.toHaveBeenCalled();
  });
});

describe('MentorProfileService publication', () => {
  it('names missing readiness fields and writes nothing', async () => {
    const h = makeHarness(undefined, profile({ publicWorkUrl: null, bio: null, stackTags: [] }));
    await expect(h.service.publish()).rejects.toMatchObject({
      status: 422,
      fieldErrors: expect.objectContaining({ publicWorkUrl: expect.any(Array) }),
    });
    expect(h.tx.flush).not.toHaveBeenCalled();
  });

  it('allocates the first slug, publishes, and emits only after the transaction', async () => {
    const h = makeHarness();
    await expect(h.service.publish()).resolves.toMatchObject({
      slug: 'ada-lovelace',
      publishedAt: NOW.toISOString(),
    });
    expect(h.em.transactional).toHaveBeenCalledWith(expect.any(Function), { clear: true });
    expect(h.eventBus.emit).toHaveBeenCalledWith('mentors.profile.published', {
      mentorProfileId: PROFILE_ID,
      slug: 'ada-lovelace',
    });
  });

  it('returns an already-published profile without changing or announcing it', async () => {
    const h = makeHarness(undefined, profile({ slug: 'stable', publishedAt: NOW }));
    await expect(h.service.publish()).resolves.toMatchObject({ slug: 'stable' });
    expect(h.tx.flush).not.toHaveBeenCalled();
    expect(h.eventBus.emit).not.toHaveBeenCalled();
  });

  it('serializes two same-profile publish calls into one transition', async () => {
    const h = makeHarness();
    const [first, second] = await Promise.all([h.service.publish(), h.service.publish()]);
    expect(first.slug).toBe('ada-lovelace');
    expect(second.slug).toBe('ada-lovelace');
    expect(h.eventBus.emit).toHaveBeenCalledTimes(1);
  });

  it('makes the last serialized publish/unpublish transition visible', async () => {
    const h = makeHarness();
    await Promise.all([h.service.publish(), h.service.unpublish()]);
    expect(h.stored?.slug).toBe('ada-lovelace');
    expect(h.stored?.publishedAt).toBeNull();
  });

  it('republishes with the retained slug', async () => {
    const h = makeHarness(undefined, profile({ slug: 'stable', publishedAt: null }));
    await expect(h.service.publish()).resolves.toMatchObject({ slug: 'stable' });
    expect(h.stored?.slug).toBe('stable');
  });

  it('retries only the named slug constraint in a fresh outer transaction', async () => {
    const h = makeHarness();
    h.em.transactional
      .mockRejectedValueOnce(uniqueViolation('mentor_profiles_slug_unique'))
      .mockImplementationOnce(async (run: (inner: typeof h.tx) => unknown) => run(h.tx));
    await expect(h.service.publish()).resolves.toMatchObject({ slug: 'ada-lovelace-2' });
    expect(h.em.transactional).toHaveBeenCalledTimes(2);

    for (const error of [
      uniqueViolation('mentor_profiles_user_id_unique'),
      uniqueViolation(),
      new Error('offline'),
    ]) {
      const other = makeHarness();
      other.em.transactional.mockRejectedValueOnce(error);
      await expect(other.service.publish()).rejects.toBe(error);
    }
  });

  it('stops after the bounded collision chain', async () => {
    const h = makeHarness();
    h.em.transactional.mockRejectedValue(uniqueViolation('mentor_profiles_slug_unique'));
    await expect(h.service.publish()).rejects.toThrow(ConflictError);
    expect(h.em.transactional).toHaveBeenCalledTimes(MAX_SLUG_ATTEMPTS);
  });
});

describe('MentorProfileService public read', () => {
  it('returns only an explicitly published slug', async () => {
    const h = makeHarness(undefined, profile({ slug: 'ada', publishedAt: NOW }));
    h.slotService.listPublic.mockResolvedValue([
      { id: 'slot-1', startsAt: '2026-09-10T14:00:00.000Z', meetsLeadTime: true },
    ]);
    await expect(h.service.getPublicBySlug('ada')).resolves.toEqual({
      displayName: 'Ada Lovelace',
      publicWorkUrl: 'https://github.com/ada',
      bio: 'I built compilers.',
      stackTags: ['TypeScript'],
      slug: 'ada',
      slots: [{ id: 'slot-1', startsAt: '2026-09-10T14:00:00.000Z', meetsLeadTime: true }],
      prices: null,
    });
    expect(h.em.findOne).toHaveBeenCalledWith(
      MentorProfile,
      { slug: 'ada', publishedAt: { $ne: null } },
      { populate: ['user'] },
    );
    expect(h.slotService.listPublic).toHaveBeenCalledExactlyOnceWith(PROFILE_ID);
  });

  it('answers an unknown or unpublished slug with not-found', async () => {
    await expect(makeHarness(undefined, null).service.getPublicBySlug('missing')).rejects.toThrow(
      NotFoundError,
    );
  });
});

describe('public mentor list', () => {
  const OTHER_ID = '30000000-0000-4000-8000-000000000002';

  function bookable(overrides: Partial<IMentorProfile> = {}): IMentorProfile {
    return profile({
      slug: 'ada',
      publishedAt: NOW,
      lastPublishedAvailabilityAt: new Date('2026-09-09T08:00:00.000Z'),
      price25Cents: 12_000,
      price50Cents: 22_000,
      ...overrides,
    });
  }

  function futureSlot(mentorProfile: IMentorProfile, startsAt: string) {
    return { id: `slot-${startsAt}`, mentorProfile, startsAt: new Date(startsAt) };
  }

  function makeListHarness(profiles: IMentorProfile[], slots: unknown[] = []) {
    const em = {
      find: vi.fn(async (entity: unknown) => (entity === MentorProfile ? profiles : slots)),
    };
    const service = new MentorProfileService({
      em: em as unknown as EntityManager,
      clock: { now: () => NOW },
      eventBus: { emit: vi.fn(async () => undefined) } as never,
      session: Promise.resolve(null),
      slotService: { listPublic: vi.fn(async () => []) } as never,
      platformSettingsService: { get: vi.fn(() => SETTINGS) },
    });
    return { service, em };
  }

  it('lists a bookable mentor with both prices and the earliest future time', async () => {
    const ada = bookable();
    const h = makeListHarness([ada], [
      futureSlot(ada, '2026-09-12T09:00:00.000Z'),
      futureSlot(ada, '2026-09-14T09:00:00.000Z'),
    ]);

    await expect(h.service.listPublished()).resolves.toEqual([
      {
        slug: 'ada',
        displayName: 'Ada Lovelace',
        bio: 'I built compilers.',
        stackTags: ['TypeScript'],
        prices: { price25Cents: 12_000, price50Cents: 22_000, currency: 'PLN' },
        nextAvailableAt: '2026-09-12T09:00:00.000Z',
      },
    ]);
  });

  it('asks only for published mentors who have both prices, newest availability first', async () => {
    const h = makeListHarness([bookable()], [futureSlot(bookable(), '2026-09-12T09:00:00.000Z')]);

    await h.service.listPublished();

    expect(h.em.find).toHaveBeenNthCalledWith(
      1,
      MentorProfile,
      { publishedAt: { $ne: null }, price25Cents: { $ne: null }, price50Cents: { $ne: null } },
      {
        populate: ['user'],
        orderBy: [{ lastPublishedAvailabilityAt: 'desc' }, { id: 'asc' }],
        limit: MAX_LISTED_MENTORS,
      },
    );
    expect(h.em.find).toHaveBeenNthCalledWith(
      2,
      Slot,
      { mentorProfile: { $in: [PROFILE_ID] }, removedAt: null, startsAt: { $gt: NOW } },
      { orderBy: { startsAt: 'asc' } },
    );
  });

  it('narrows to one stack tag with an array-membership operator', async () => {
    const h = makeListHarness([], []);

    await expect(h.service.listPublished('React')).resolves.toEqual([]);

    expect(h.em.find).toHaveBeenCalledExactlyOnceWith(
      MentorProfile,
      expect.objectContaining({ stackTags: { $contains: ['React'] } }),
      expect.anything(),
    );
  });

  it('keeps the caller order and drops a mentor whose times have all passed', async () => {
    const ada = bookable();
    const grace = bookable({
      id: OTHER_ID,
      slug: 'grace',
      user: user({ displayName: 'Grace Hopper' }),
      lastPublishedAvailabilityAt: new Date('2026-09-08T08:00:00.000Z'),
    });
    const h = makeListHarness([ada, grace], [futureSlot(grace, '2026-09-13T09:00:00.000Z')]);

    const listed = await h.service.listPublished();

    expect(listed.map((mentor) => mentor.slug)).toEqual(['grace']);
  });

  it('refuses to price a list when platform settings are unavailable', async () => {
    const service = new MentorProfileService({
      em: { find: vi.fn(async () => []) } as unknown as EntityManager,
      clock: { now: () => NOW },
      eventBus: { emit: vi.fn(async () => undefined) } as never,
      session: Promise.resolve(null),
    });

    await expect(service.listPublished()).rejects.toThrow(ServiceUnavailableError);
  });
});
