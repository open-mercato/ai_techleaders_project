import {
  Invitation,
  LockMode,
  MentorProfile,
  UniqueConstraintViolationException,
  User,
  type EntityManager,
  type IInvitation,
  type Role,
} from '@devmentor/db';
import type { AppEnv } from '../../config/env';
import type { EventBus } from '../../events/event-bus';
import { ConflictError, ForbiddenError, NotFoundError, UnauthorizedError } from '../../http/errors';
import type { Session } from '../../http/auth';
import { requireRole } from '../../http/auth';
import type { Clock } from '../../time/clock';
import type { StackTag } from '../../domain/vocabularies/stack-tags';
import type { TokenService } from '../auth/token.service';
import type { PendingRolesChange, UserService } from '../auth/user.service';

const INVALID_INVITATION_MESSAGE = 'This invitation is not valid.';
const PENDING_EMAIL_CONSTRAINT = 'invitations_pending_email_unique';

export interface InvitationPublicDto {
  email: string;
  stackTags: readonly StackTag[];
  expiresAt: string;
}

export interface InvitationCreateInput {
  email: string;
  stackTags: readonly StackTag[];
  batch?: string;
}

export interface CreatedInvitation {
  id: string;
  email: string;
  link: string;
  expiresAt: string;
}

export interface AcceptedInvitation {
  roles: readonly Role[];
  publishDueAt: string;
  sessionVersion: number;
  userId: string;
}

export interface ResentInvitation {
  id: string;
  link: string;
  expiresAt: string;
}

export interface InvitationViewer {
  email: string;
  displayName: string;
  emailVerified: boolean;
}

interface AcceptanceCommit extends AcceptedInvitation {
  invitationId: string;
  rolesChange: PendingRolesChange;
}

function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function invalidInvitation(): NotFoundError {
  return new NotFoundError(INVALID_INVITATION_MESSAGE);
}

function isPending(invitation: IInvitation): boolean {
  return invitation.acceptedAt == null && invitation.revokedAt == null;
}

function isUsable(invitation: IInvitation, now: Date): boolean {
  return isPending(invitation) && invitation.expiresAt.getTime() > now.getTime();
}

function constraintName(error: unknown): string | null {
  if (!(error instanceof UniqueConstraintViolationException)) {
    return null;
  }
  const value = (error as { constraint?: unknown }).constraint;
  return typeof value === 'string' ? value : null;
}

export class InvitationService {
  private readonly em: EntityManager;
  private readonly env: AppEnv;
  private readonly clock: Clock;
  private readonly tokenService: TokenService;
  private readonly userService: UserService;
  private readonly eventBus: EventBus;
  private readonly session: Promise<Session | null>;

  constructor({
    em,
    env,
    clock,
    tokenService,
    userService,
    eventBus,
    session,
  }: {
    em: EntityManager;
    env: AppEnv;
    clock: Clock;
    tokenService: TokenService;
    userService: UserService;
    eventBus: EventBus;
    session: Promise<Session | null>;
  }) {
    this.em = em;
    this.env = env;
    this.clock = clock;
    this.tokenService = tokenService;
    this.userService = userService;
    this.eventBus = eventBus;
    this.session = session;
  }

  async create(input: InvitationCreateInput): Promise<CreatedInvitation> {
    const email = normalizeEmail(input.email);
    const now = this.clock.now();
    const expiresAt = addDays(now, this.env.INVITATION_TTL_DAYS);
    const pair = this.tokenService.mintOpaqueToken();

    try {
      const invitation = await this.em.transactional(async (tx) => {
        const user = await tx.findOne(User, { email }, { lockMode: LockMode.PESSIMISTIC_WRITE });
        if (user?.roles.includes('mentor')) {
          throw new ConflictError('This person is already a mentor.');
        }

        const pending = await tx.findOne(Invitation, {
          email,
          acceptedAt: null,
          revokedAt: null,
        });
        if (pending !== null) {
          throw new ConflictError(
            'This address already has an unresolved invitation. Resend or revoke it first.',
          );
        }

        const created = tx.create(Invitation, {
          email,
          tokenHash: pair.tokenHash,
          stackTags: [...input.stackTags],
          expiresAt,
          batch: input.batch ?? null,
        });
        tx.persist(created);
        await tx.flush();
        return created;
      });

      return {
        id: invitation.id,
        email: invitation.email,
        link: new URL(`/invitation/${pair.token}`, this.env.APP_URL).toString(),
        expiresAt: invitation.expiresAt.toISOString(),
      };
    } catch (error) {
      if (constraintName(error) === PENDING_EMAIL_CONSTRAINT) {
        throw new ConflictError(
          'This address already has an unresolved invitation. Resend or revoke it first.',
        );
      }
      throw error;
    }
  }

  async lookup(token: string, now = this.clock.now()): Promise<InvitationPublicDto> {
    const invitation = await this.em.findOne(Invitation, {
      tokenHash: this.tokenService.hashToken(token),
    });
    if (invitation === null || !isUsable(invitation, now)) {
      throw invalidInvitation();
    }
    return {
      email: invitation.email,
      stackTags: invitation.stackTags as StackTag[],
      expiresAt: invitation.expiresAt.toISOString(),
    };
  }

  async viewer(): Promise<InvitationViewer | null> {
    const session = await this.session;
    if (session === null) {
      return null;
    }
    const loaded = await this.em.findOne(User, { id: session.userId });
    if (loaded === null) {
      return null;
    }
    return {
      email: loaded.email,
      displayName: loaded.displayName,
      emailVerified: loaded.emailVerifiedAt != null,
    };
  }

  async accept(token: string, now = this.clock.now()): Promise<AcceptedInvitation> {
    const session = await this.session;
    if (session === null) {
      throw new UnauthorizedError();
    }

    const tokenHash = this.tokenService.hashToken(token);
    const outcome = await this.em.transactional<AcceptanceCommit>(async (tx) => {
      // The user lock is deliberately first. Different historical tokens for the same
      // person therefore serialize role, profile and first-deadline effects.
      const user = await tx.findOne(
        User,
        { id: session.userId },
        { populate: ['mentorProfile'], lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (user === null) {
        throw new UnauthorizedError();
      }

      const invitation = await tx.findOne(
        Invitation,
        { tokenHash },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (invitation === null || !isUsable(invitation, now)) {
        throw invalidInvitation();
      }

      if (
        user.emailVerifiedAt == null ||
        normalizeEmail(user.email) !== normalizeEmail(invitation.email)
      ) {
        throw new ForbiddenError(
          'Sign in with the verified email address this invitation was sent to.',
        );
      }

      const publishDueAt = addDays(now, this.env.MENTOR_PUBLISH_WINDOW_DAYS);
      const roleGrant = this.userService.stageRoleGrant(user, 'mentor');
      let profile = user.mentorProfile;
      if (profile == null) {
        profile = tx.create(MentorProfile, {
          user,
          headline: '',
          yearsOfExperience: 0,
          initialPublishDueAt: publishDueAt,
        });
        tx.persist(profile);
        user.mentorProfile = profile;
      } else if (profile.initialPublishDueAt == null) {
        profile.initialPublishDueAt = publishDueAt;
      }

      invitation.acceptedAt = now;
      invitation.acceptedBy = user;
      invitation.publishDueAt = publishDueAt;
      await tx.flush();

      return {
        invitationId: invitation.id,
        userId: user.id,
        roles: roleGrant.roles,
        sessionVersion: roleGrant.sessionVersion,
        publishDueAt: publishDueAt.toISOString(),
        rolesChange: roleGrant.change,
      };
    });

    // Both events are post-commit. A failed flush or rollback must never announce a
    // mentor grant that did not happen.
    await this.userService.announceStagedRoleChange(outcome.rolesChange);
    await this.eventBus.emit('invitations.invitation.accepted', {
      invitationId: outcome.invitationId,
      userId: outcome.userId,
      publishDueAt: outcome.publishDueAt,
    });

    return {
      userId: outcome.userId,
      roles: outcome.roles,
      sessionVersion: outcome.sessionVersion,
      publishDueAt: outcome.publishDueAt,
    };
  }

  async revoke(id: string, now = this.clock.now()): Promise<{ id: string }> {
    return this.em.transactional(async (tx) => {
      const invitation = await tx.findOne(
        Invitation,
        { id },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (invitation === null) {
        throw new NotFoundError('No such invitation.');
      }
      if (!isPending(invitation)) {
        throw new ConflictError('Only a pending invitation can be revoked.');
      }
      invitation.revokedAt = now;
      await tx.flush();
      return { id: invitation.id };
    });
  }

  async resend(id: string, now = this.clock.now()): Promise<ResentInvitation> {
    const pair = this.tokenService.mintOpaqueToken();
    const expiresAt = addDays(now, this.env.INVITATION_TTL_DAYS);
    const invitation = await this.em.transactional(async (tx) => {
      const pending = await tx.findOne(
        Invitation,
        { id },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (pending === null) {
        throw new NotFoundError('No such invitation.');
      }
      if (!isPending(pending)) {
        throw new ConflictError('Only a pending invitation can be resent.');
      }
      pending.tokenHash = pair.tokenHash;
      pending.expiresAt = expiresAt;
      await tx.flush();
      return pending;
    });
    return {
      id: invitation.id,
      link: new URL(`/invitation/${pair.token}`, this.env.APP_URL).toString(),
      expiresAt: invitation.expiresAt.toISOString(),
    };
  }

  async onboarding(): Promise<{ initialPublishDueAt: string | null }> {
    const session = await this.session;
    if (session === null) {
      throw new UnauthorizedError();
    }
    requireRole(session, 'mentor');
    const profile = await this.em.findOne(MentorProfile, { user: session.userId });
    return {
      initialPublishDueAt: profile?.initialPublishDueAt?.toISOString() ?? null,
    };
  }
}

export { INVALID_INVITATION_MESSAGE };
