import {
  LockMode,
  MentorProfile,
  UniqueConstraintViolationException,
  type EntityManager,
  type IMentorProfile,
} from '@devmentor/db';
import type { EventBus } from '../../events/event-bus';
import { ConflictError, NotFoundError, UnauthorizedError } from '../../http/errors';
import { requireRole, type Session } from '../../http/auth';
import { uniqueSlug } from '../../domain/slug';
import type { StackTag } from '../../domain/vocabularies/stack-tags';
import type { Clock } from '../../time/clock';
import type { MentorProfileUpdateInput } from '../../validators/mentors/mentor-profile-update.schema';
import { mentorPagePublishable } from './readiness';

const SLUG_CONSTRAINT = 'mentor_profiles_slug_unique';
export const MAX_SLUG_ATTEMPTS = 100;

export interface MentorProfileOwnerDto {
  id: string;
  displayName: string;
  publicWorkUrl: string | null;
  bio: string | null;
  stackTags: readonly StackTag[];
  slug: string | null;
  publishedAt: string | null;
  readiness: ReturnType<typeof mentorPagePublishable.evaluate>;
}

export interface MentorProfilePublicDto {
  displayName: string;
  publicWorkUrl: string;
  bio: string;
  stackTags: readonly StackTag[];
  slug: string;
}

export function toOwnerDto(profile: IMentorProfile): MentorProfileOwnerDto {
  const input = {
    publicWorkUrl: profile.publicWorkUrl ?? null,
    bio: profile.bio ?? null,
    stackTags: profile.stackTags as StackTag[],
  };
  return {
    id: profile.id,
    displayName: profile.user.displayName,
    ...input,
    slug: profile.slug ?? null,
    publishedAt: profile.publishedAt?.toISOString() ?? null,
    readiness: mentorPagePublishable.evaluate(input),
  };
}

export function toPublicDto(profile: IMentorProfile): MentorProfilePublicDto {
  return {
    displayName: profile.user.displayName,
    publicWorkUrl: profile.publicWorkUrl as string,
    bio: profile.bio as string,
    stackTags: profile.stackTags as StackTag[],
    slug: profile.slug as string,
  };
}

function constraintName(error: unknown): string | null {
  if (!(error instanceof UniqueConstraintViolationException)) return null;
  const value = (error as { constraint?: unknown }).constraint;
  return typeof value === 'string' ? value : null;
}

export class MentorProfileService {
  private readonly em: EntityManager;
  private readonly clock: Clock;
  private readonly eventBus: EventBus;
  private readonly session: Promise<Session | null>;

  constructor({
    em,
    clock,
    eventBus,
    session,
  }: {
    em: EntityManager;
    clock: Clock;
    eventBus: EventBus;
    session: Promise<Session | null>;
  }) {
    // Destructure the PROXY cradle synchronously. Retaining it and resolving a key after
    // an await can reach a request scope that has already been disposed.
    this.em = em;
    this.clock = clock;
    this.eventBus = eventBus;
    this.session = session;
    void session.catch(() => undefined);
  }

  private async mentorSession(): Promise<Session> {
    const session = await this.session;
    if (session === null) throw new UnauthorizedError();
    requireRole(session, 'mentor');
    return session;
  }

  private async ownerProfile(
    em: EntityManager,
    userId: string,
    lock = false,
  ): Promise<IMentorProfile> {
    const profile = await em.findOne(
      MentorProfile,
      { user: userId },
      {
        populate: ['user'],
        ...(lock ? { lockMode: LockMode.PESSIMISTIC_WRITE } : {}),
      },
    );
    if (profile === null) throw new NotFoundError('Your mentor profile does not exist.');
    return profile;
  }

  async getOwner(): Promise<MentorProfileOwnerDto> {
    const session = await this.mentorSession();
    return toOwnerDto(await this.ownerProfile(this.em, session.userId));
  }

  async update(input: MentorProfileUpdateInput): Promise<MentorProfileOwnerDto> {
    const session = await this.mentorSession();
    return this.em.transactional(async (tx) => {
      const profile = await this.ownerProfile(tx, session.userId, true);
      if (input.publicWorkUrl !== undefined) profile.publicWorkUrl = input.publicWorkUrl;
      if (input.bio !== undefined) profile.bio = input.bio;
      if (input.stackTags !== undefined) profile.stackTags = [...input.stackTags];
      if (profile.publishedAt !== null) {
        mentorPagePublishable.assert({
          publicWorkUrl: profile.publicWorkUrl ?? null,
          bio: profile.bio ?? null,
          stackTags: profile.stackTags as StackTag[],
        });
      }
      await tx.flush();
      return toOwnerDto(profile);
    });
  }

  async publish(): Promise<MentorProfileOwnerDto> {
    const session = await this.mentorSession();

    for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt += 1) {
      try {
        const outcome = await this.em.transactional(
          async (tx) => {
            const profile = await this.ownerProfile(tx, session.userId, true);
            if (profile.publishedAt !== null) return { dto: toOwnerDto(profile), published: false };

            mentorPagePublishable.assert({
              publicWorkUrl: profile.publicWorkUrl ?? null,
              bio: profile.bio ?? null,
              stackTags: profile.stackTags as StackTag[],
            });
            if (profile.slug === null) profile.slug = uniqueSlug(profile.user.displayName, attempt);
            profile.publishedAt = this.clock.now();
            await tx.flush();
            return { dto: toOwnerDto(profile), published: true };
          },
          { clear: true },
        );
        if (outcome.published) {
          await this.eventBus.emit('mentors.profile.published', {
            mentorProfileId: outcome.dto.id,
            slug: outcome.dto.slug as string,
          });
        }
        return outcome.dto;
      } catch (error) {
        if (constraintName(error) !== SLUG_CONSTRAINT) throw error;
      }
    }

    throw new ConflictError('Could not allocate a share link. Try publishing again.');
  }

  async unpublish(): Promise<MentorProfileOwnerDto> {
    const session = await this.mentorSession();
    return this.em.transactional(async (tx) => {
      const profile = await this.ownerProfile(tx, session.userId, true);
      profile.publishedAt = null;
      await tx.flush();
      return toOwnerDto(profile);
    });
  }

  async getPublicBySlug(slug: string): Promise<MentorProfilePublicDto> {
    const profile = await this.em.findOne(
      MentorProfile,
      { slug, publishedAt: { $ne: null } },
      { populate: ['user'] },
    );
    if (profile === null) throw new NotFoundError('Mentor page not found.');
    return toPublicDto(profile);
  }
}
