import { describe, expect, it, vi } from 'vitest';
import {
  MentorProfile,
  UniqueConstraintViolationException,
  type EntityManager,
  type IMentorProfile,
  type IUser,
} from '@devmentor/db';
import type { Session } from '../../http/auth';
import type { SlotPublicDto } from '../availability/slot.service';
import { ConflictError, ForbiddenError, NotFoundError, UnauthorizedError } from '../../http/errors';
import {
  MAX_SLUG_ATTEMPTS,
  MentorProfileService,
  toOwnerDto,
  toPublicDto,
} from './mentor-profile.service';

const NOW = new Date('2026-09-10T12:00:00.000Z');
const PROFILE_ID = '30000000-0000-4000-8000-000000000001';
const USER_ID = '10000000-0000-4000-8000-000000000001';

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
  const service = new MentorProfileService({
    em: em as unknown as EntityManager,
    clock: { now: () => NOW },
    eventBus: eventBus as never,
    session: session instanceof Promise ? session : Promise.resolve(session),
    slotService: slotService as never,
  });
  return { service, em, tx, eventBus, slotService, stored };
}

describe('mentor profile projections', () => {
  it('builds the exact owner shape and evaluates draft readiness', () => {
    const dto = toOwnerDto(profile({ publicWorkUrl: undefined, bio: undefined }));
    expect(Object.keys(dto).sort()).toEqual([
      'bio', 'displayName', 'id', 'publicWorkUrl', 'publishedAt', 'readiness', 'slug', 'stackTags',
    ]);
    expect(dto.publicWorkUrl).toBeNull();
    expect(dto.bio).toBeNull();
    expect(dto.slug).toBeNull();
    expect(dto.publishedAt).toBeNull();
    expect(dto.readiness.ready).toBe(false);
  });

  it('builds the exact public allowlist without private profile or user fields', () => {
    const dto = toPublicDto(profile({ slug: 'ada', publishedAt: NOW }), []);
    expect(Object.keys(dto).sort()).toEqual([
      'bio', 'displayName', 'publicWorkUrl', 'slots', 'slug', 'stackTags',
    ]);
    expect(dto).toEqual({
      displayName: 'Ada Lovelace',
      publicWorkUrl: 'https://github.com/ada',
      bio: 'I built compilers.',
      stackTags: ['TypeScript'],
      slug: 'ada',
      slots: [],
    });
  });

  it('keeps the Slice 2 public projection callable without an availability argument', () => {
    expect(toPublicDto(profile({ slug: 'ada', publishedAt: NOW }))).toMatchObject({
      slug: 'ada',
      slots: [],
    });
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
