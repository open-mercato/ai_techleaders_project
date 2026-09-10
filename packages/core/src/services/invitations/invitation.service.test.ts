import { describe, expect, it, vi } from 'vitest';
import {
  Invitation,
  MentorProfile,
  UniqueConstraintViolationException,
  User,
  type EntityManager,
  type IInvitation,
  type IMentorProfile,
  type IUser,
} from '@devmentor/db';
import type { AppEnv } from '../../config/env';
import type { Session } from '../../http/auth';
import { ConflictError, ForbiddenError, NotFoundError, UnauthorizedError } from '../../http/errors';
import type { TokenService } from '../auth/token.service';
import type { UserService } from '../auth/user.service';
import {
  INVALID_INVITATION_MESSAGE,
  InvitationService,
} from './invitation.service';

const NOW = new Date('2026-09-10T12:00:00.000Z');
const USER_ID = '10000000-0000-4000-8000-000000000001';
const INVITATION_ID = '20000000-0000-4000-8000-000000000001';

function invitation(overrides: Partial<IInvitation> = {}): IInvitation {
  return {
    id: INVITATION_ID,
    email: 'ada@example.com',
    tokenHash: 'a'.repeat(64),
    stackTags: ['TypeScript'],
    expiresAt: new Date('2026-09-24T12:00:00.000Z'),
    acceptedAt: null,
    acceptedBy: null,
    publishDueAt: null,
    revokedAt: null,
    batch: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as IInvitation;
}

function user(overrides: Partial<IUser> = {}): IUser {
  return {
    id: USER_ID,
    email: 'ada@example.com',
    displayName: 'Ada',
    roles: ['mentee'],
    githubId: '123',
    githubLogin: 'ada',
    avatarUrl: null,
    emailVerifiedAt: NOW,
    sessionVersion: 0,
    mentorProfile: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  } as IUser;
}

function profile(overrides: Partial<IMentorProfile> = {}): IMentorProfile {
  return {
    id: '30000000-0000-4000-8000-000000000001',
    user: user(),
    headline: '',
    bio: null,
    yearsOfExperience: 0,
    initialPublishDueAt: null,
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

function makeHarness(session: Session | null = { userId: USER_ID, roles: ['mentee'] }) {
  const tx = {
    findOne: vi.fn(),
    create: vi.fn((entity: unknown, data: Record<string, unknown>) => {
      if (entity === Invitation) return invitation(data as Partial<IInvitation>);
      if (entity === MentorProfile) return profile(data as Partial<IMentorProfile>);
      throw new Error('unexpected entity');
    }),
    persist: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
  };
  const em = {
    findOne: vi.fn(),
    transactional: vi.fn(async (run: (inner: typeof tx) => unknown) => run(tx)),
  };
  const tokenService = {
    mintOpaqueToken: vi.fn(() => ({ token: 'raw-token', tokenHash: 'a'.repeat(64) })),
    hashToken: vi.fn(() => 'a'.repeat(64)),
  };
  const stagedChange = {
    userId: USER_ID,
    roles: ['mentee', 'mentor'] as const,
    previousRoles: ['mentee'] as const,
    reason: 'granted' as const,
  };
  const userService = {
    stageRoleGrant: vi.fn((loaded: IUser) => {
      loaded.roles = ['mentee', 'mentor'];
      loaded.sessionVersion += 1;
      return { roles: loaded.roles, sessionVersion: loaded.sessionVersion, change: stagedChange };
    }),
    announceStagedRoleChange: vi.fn().mockResolvedValue(undefined),
  };
  const eventBus = { emit: vi.fn().mockResolvedValue(undefined) };
  const service = new InvitationService({
    em: em as unknown as EntityManager,
    env: {
      APP_URL: 'https://devmentor.test',
      INVITATION_TTL_DAYS: 14,
      MENTOR_PUBLISH_WINDOW_DAYS: 14,
    } as AppEnv,
    clock: { now: () => NOW },
    tokenService: tokenService as unknown as TokenService,
    userService: userService as unknown as UserService,
    eventBus: eventBus as never,
    session: Promise.resolve(session),
  });
  return { service, em, tx, tokenService, userService, eventBus };
}

describe('InvitationService.create', () => {
  it('normalizes the address, snapshots expiry, and returns the raw token only in the link', async () => {
    const h = makeHarness();
    h.tx.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

    await expect(
      h.service.create({ email: '  Ada@Example.COM ', stackTags: ['TypeScript'], batch: 'pilot-1' }),
    ).resolves.toEqual({
      id: INVITATION_ID,
      email: 'ada@example.com',
      link: 'https://devmentor.test/invitation/raw-token',
      expiresAt: '2026-09-24T12:00:00.000Z',
    });
    expect(h.tx.create).toHaveBeenCalledWith(
      Invitation,
      expect.objectContaining({
        email: 'ada@example.com',
        tokenHash: 'a'.repeat(64),
        stackTags: ['TypeScript'],
        batch: 'pilot-1',
      }),
    );
    expect(h.tx.persist).toHaveBeenCalledOnce();
    expect(h.tx.flush).toHaveBeenCalledOnce();
  });

  it('stores a null batch when no operator batch is supplied', async () => {
    const h = makeHarness();
    h.tx.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    await h.service.create({ email: 'ada@example.com', stackTags: ['React'] });
    expect(h.tx.create).toHaveBeenCalledWith(Invitation, expect.objectContaining({ batch: null }));
  });

  it('refuses an address whose current user already holds mentor', async () => {
    const h = makeHarness();
    h.tx.findOne.mockResolvedValueOnce(user({ roles: ['mentee', 'mentor'] }));
    await expect(
      h.service.create({ email: 'ada@example.com', stackTags: [] }),
    ).rejects.toThrow('already a mentor');
  });

  it('refuses an existing unresolved invitation even when it is expired', async () => {
    const h = makeHarness();
    h.tx.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(
      invitation({ expiresAt: new Date('2020-01-01T00:00:00Z') }),
    );
    await expect(
      h.service.create({ email: 'ada@example.com', stackTags: [] }),
    ).rejects.toThrow(ConflictError);
  });

  it('maps only the pending-email race to the same conflict', async () => {
    const h = makeHarness();
    h.em.transactional.mockRejectedValueOnce(
      uniqueViolation('invitations_pending_email_unique'),
    );
    await expect(
      h.service.create({ email: 'ada@example.com', stackTags: [] }),
    ).rejects.toThrow('unresolved invitation');

    h.em.transactional.mockRejectedValueOnce(uniqueViolation('invitations_token_hash_unique'));
    await expect(
      h.service.create({ email: 'ada@example.com', stackTags: [] }),
    ).rejects.toBeInstanceOf(UniqueConstraintViolationException);

    h.em.transactional.mockRejectedValueOnce(uniqueViolation());
    await expect(
      h.service.create({ email: 'ada@example.com', stackTags: [] }),
    ).rejects.toBeInstanceOf(UniqueConstraintViolationException);

    const unexpected = new Error('database offline');
    h.em.transactional.mockRejectedValueOnce(unexpected);
    await expect(
      h.service.create({ email: 'ada@example.com', stackTags: [] }),
    ).rejects.toBe(unexpected);
  });
});

describe('InvitationService.lookup', () => {
  it('returns the public projection for a usable token', async () => {
    const h = makeHarness();
    h.em.findOne.mockResolvedValueOnce(invitation());
    await expect(h.service.lookup('raw-token')).resolves.toEqual({
      email: 'ada@example.com',
      stackTags: ['TypeScript'],
      expiresAt: '2026-09-24T12:00:00.000Z',
    });
  });

  it.each([
    ['unknown', null],
    ['expired', invitation({ expiresAt: NOW })],
    ['revoked', invitation({ revokedAt: NOW })],
    ['consumed', invitation({ acceptedAt: NOW, acceptedBy: user() })],
  ])('hides the %s state behind one not-found answer', async (_label, found) => {
    const h = makeHarness();
    h.em.findOne.mockResolvedValueOnce(found);
    await expect(h.service.lookup('raw-token')).rejects.toMatchObject({
      status: 404,
      message: INVALID_INVITATION_MESSAGE,
    });
  });
});

describe('InvitationService.viewer', () => {
  it('returns null without a session or when its user disappeared', async () => {
    await expect(makeHarness(null).service.viewer()).resolves.toBeNull();
    const h = makeHarness();
    h.em.findOne.mockResolvedValueOnce(null);
    await expect(h.service.viewer()).resolves.toBeNull();
  });

  it('returns only the identity fields the invitation page needs', async () => {
    const h = makeHarness();
    h.em.findOne.mockResolvedValueOnce(user({ emailVerifiedAt: null }));
    await expect(h.service.viewer()).resolves.toEqual({
      email: 'ada@example.com',
      displayName: 'Ada',
      emailVerified: false,
    });
    h.em.findOne.mockResolvedValueOnce(user());
    await expect(h.service.viewer()).resolves.toMatchObject({ emailVerified: true });
  });
});

describe('InvitationService.accept', () => {
  it('requires a live caller before starting a transaction', async () => {
    const h = makeHarness(null);
    await expect(h.service.accept('raw-token')).rejects.toThrow(UnauthorizedError);
    expect(h.em.transactional).not.toHaveBeenCalled();
  });

  it('rejects a vanished caller as unauthorized', async () => {
    const h = makeHarness();
    h.tx.findOne.mockResolvedValueOnce(null);
    await expect(h.service.accept('raw-token')).rejects.toThrow(UnauthorizedError);
  });

  it('keeps unknown and no-longer-usable tokens indistinguishable', async () => {
    const h = makeHarness();
    h.tx.findOne.mockResolvedValueOnce(user()).mockResolvedValueOnce(null);
    await expect(h.service.accept('raw-token')).rejects.toThrow(INVALID_INVITATION_MESSAGE);

    const again = makeHarness();
    again.tx.findOne
      .mockResolvedValueOnce(user())
      .mockResolvedValueOnce(invitation({ expiresAt: NOW }));
    await expect(again.service.accept('raw-token')).rejects.toThrow(NotFoundError);
  });

  it('refuses an unverified account without consuming anything', async () => {
    const h = makeHarness();
    const invite = invitation();
    h.tx.findOne
      .mockResolvedValueOnce(user({ emailVerifiedAt: null }))
      .mockResolvedValueOnce(invite);
    await expect(h.service.accept('raw-token')).rejects.toThrow(ForbiddenError);
    expect(invite.acceptedAt).toBeNull();
    expect(h.userService.stageRoleGrant).not.toHaveBeenCalled();
  });

  it('refuses a verified normalized-email mismatch without consuming anything', async () => {
    const h = makeHarness();
    h.tx.findOne
      .mockResolvedValueOnce(user({ email: 'other@example.com' }))
      .mockResolvedValueOnce(invitation());
    await expect(h.service.accept('raw-token')).rejects.toThrow(ForbiddenError);
    expect(h.tx.flush).not.toHaveBeenCalled();
  });

  it('locks user first, grants additively, creates the profile, and emits only post-commit', async () => {
    const h = makeHarness();
    const loadedUser = user({ email: ' Ada@Example.com ' });
    const invite = invitation();
    h.tx.findOne.mockResolvedValueOnce(loadedUser).mockResolvedValueOnce(invite);

    await expect(h.service.accept('raw-token')).resolves.toEqual({
      userId: USER_ID,
      roles: ['mentee', 'mentor'],
      sessionVersion: 1,
      publishDueAt: '2026-09-24T12:00:00.000Z',
    });
    expect(h.tx.findOne.mock.calls[0]?.[0]).toBe(User);
    expect(h.tx.findOne.mock.calls[1]?.[0]).toBe(Invitation);
    expect(h.tx.create).toHaveBeenCalledWith(
      MentorProfile,
      expect.objectContaining({ user: loadedUser, initialPublishDueAt: expect.any(Date) }),
    );
    expect(invite.acceptedAt).toBe(NOW);
    expect(invite.acceptedBy).toBe(loadedUser);
    expect(h.userService.announceStagedRoleChange).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'granted' }),
    );
    expect(h.eventBus.emit).toHaveBeenCalledWith('invitations.invitation.accepted', {
      invitationId: INVITATION_ID,
      userId: USER_ID,
      publishDueAt: '2026-09-24T12:00:00.000Z',
    });
  });

  it('sets an existing profile deadline only once', async () => {
    const h = makeHarness();
    const missingDeadline = profile();
    h.tx.findOne
      .mockResolvedValueOnce(user({ mentorProfile: missingDeadline }))
      .mockResolvedValueOnce(invitation());
    await h.service.accept('raw-token');
    expect(missingDeadline.initialPublishDueAt?.toISOString()).toBe('2026-09-24T12:00:00.000Z');
    expect(h.tx.create).not.toHaveBeenCalled();

    const firstDeadline = new Date('2026-01-01T00:00:00Z');
    const kept = profile({ initialPublishDueAt: firstDeadline });
    const again = makeHarness();
    again.tx.findOne
      .mockResolvedValueOnce(user({ mentorProfile: kept }))
      .mockResolvedValueOnce(invitation());
    await again.service.accept('raw-token');
    expect(kept.initialPublishDueAt).toBe(firstDeadline);
  });

  it('emits nothing when persistence fails and the transaction rolls back', async () => {
    const h = makeHarness();
    h.tx.findOne.mockResolvedValueOnce(user()).mockResolvedValueOnce(invitation());
    h.tx.flush.mockRejectedValueOnce(new Error('rollback'));
    await expect(h.service.accept('raw-token')).rejects.toThrow('rollback');
    expect(h.userService.announceStagedRoleChange).not.toHaveBeenCalled();
    expect(h.eventBus.emit).not.toHaveBeenCalled();
  });
});

describe('InvitationService revoke, resend and onboarding', () => {
  it('revokes a pending invitation, including an expired one', async () => {
    const h = makeHarness();
    const pending = invitation({ expiresAt: new Date('2020-01-01T00:00:00Z') });
    h.tx.findOne.mockResolvedValueOnce(pending);
    await expect(h.service.revoke(INVITATION_ID)).resolves.toEqual({ id: INVITATION_ID });
    expect(pending.revokedAt).toBe(NOW);
  });

  it('refuses to revoke a missing or resolved invitation', async () => {
    const h = makeHarness();
    h.tx.findOne.mockResolvedValueOnce(null);
    await expect(h.service.revoke('missing')).rejects.toThrow(NotFoundError);
    const again = makeHarness();
    again.tx.findOne.mockResolvedValueOnce(invitation({ acceptedAt: NOW, acceptedBy: user() }));
    await expect(again.service.revoke(INVITATION_ID)).rejects.toThrow(ConflictError);
  });

  it('resends a pending invitation by rotating its token and expiry', async () => {
    const h = makeHarness();
    const pending = invitation({ tokenHash: 'old', expiresAt: new Date('2020-01-01T00:00:00Z') });
    h.tx.findOne.mockResolvedValueOnce(pending);
    await expect(h.service.resend(INVITATION_ID)).resolves.toEqual({
      id: INVITATION_ID,
      link: 'https://devmentor.test/invitation/raw-token',
      expiresAt: '2026-09-24T12:00:00.000Z',
    });
    expect(pending.tokenHash).toBe('a'.repeat(64));
  });

  it('refuses to resend a missing or resolved invitation', async () => {
    const h = makeHarness();
    h.tx.findOne.mockResolvedValueOnce(null);
    await expect(h.service.resend('missing')).rejects.toThrow(NotFoundError);
    const again = makeHarness();
    again.tx.findOne.mockResolvedValueOnce(invitation({ revokedAt: NOW }));
    await expect(again.service.resend(INVITATION_ID)).rejects.toThrow(ConflictError);
  });

  it('returns a durable onboarding deadline or null when no deadline exists', async () => {
    const h = makeHarness();
    h.em.findOne.mockResolvedValueOnce(profile({ initialPublishDueAt: NOW }));
    const mentor = makeHarness({ userId: USER_ID, roles: ['mentor'] });
    mentor.em.findOne.mockResolvedValueOnce(profile({ initialPublishDueAt: NOW }));
    await expect(mentor.service.onboarding()).resolves.toEqual({
      initialPublishDueAt: NOW.toISOString(),
    });
    mentor.em.findOne.mockResolvedValueOnce(profile()).mockResolvedValueOnce(null);
    await expect(mentor.service.onboarding()).resolves.toEqual({ initialPublishDueAt: null });
    await expect(mentor.service.onboarding()).resolves.toEqual({ initialPublishDueAt: null });
  });

  it('enforces mentor ownership inside the onboarding service', async () => {
    await expect(makeHarness(null).service.onboarding()).rejects.toThrow(UnauthorizedError);
    await expect(makeHarness().service.onboarding()).rejects.toThrow(ForbiddenError);
  });
});
