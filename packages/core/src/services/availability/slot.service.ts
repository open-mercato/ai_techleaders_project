import {
  LockMode,
  MentorProfile,
  Slot,
  type EntityManager,
  type IMentorProfile,
  type ISlot,
} from '@devmentor/db';
import type { EventBus } from '../../events/event-bus';
import { requireRole, type Session } from '../../http/auth';
import {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../../http/errors';
import type { Clock } from '../../time/clock';
import type { SlotCreateInput } from '../../validators/availability/slot-create.schema';

const ACTIVE_SLOT_CONSTRAINT = 'slots_active_mentor_profile_starts_at_unique';
const LEAD_TIME_MS = 2 * 60 * 60 * 1000;
export const MAX_ACTIVE_SLOTS = 500;

export interface SlotOwnerDto {
  id: string;
  startsAt: string;
  /** Optional for source compatibility; live owner projections always include this key. */
  isFuture?: boolean;
}

export interface SlotPublicDto {
  id: string;
  startsAt: string;
  meetsLeadTime: boolean;
}

function toOwnerDto(slot: ISlot, now: Date): SlotOwnerDto {
  return {
    id: slot.id,
    startsAt: slot.startsAt.toISOString(),
    isFuture: slot.startsAt.getTime() >= now.getTime(),
  };
}

function constraintName(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const value = error as { code?: unknown; constraint?: unknown };
  return value.code === '23505' && typeof value.constraint === 'string'
    ? value.constraint
    : null;
}

export class SlotService {
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

  private async ownerProfile(em: EntityManager, userId: string): Promise<IMentorProfile> {
    const profile = await em.findOne(
      MentorProfile,
      { user: userId },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    );
    if (profile === null) throw new NotFoundError('Your mentor profile does not exist.');
    return profile;
  }

  async listOwner(): Promise<SlotOwnerDto[]> {
    const session = await this.mentorSession();
    const now = this.clock.now();
    const profile = await this.em.findOne(MentorProfile, { user: session.userId });
    if (profile === null) throw new NotFoundError('Your mentor profile does not exist.');
    const slots = await this.em.find(
      Slot,
      { mentorProfile: profile.id, removedAt: null },
      { orderBy: { startsAt: 'asc' }, limit: MAX_ACTIVE_SLOTS },
    );
    return slots.map((slot) => toOwnerDto(slot, now));
  }

  async publish(input: SlotCreateInput): Promise<SlotOwnerDto> {
    const session = await this.mentorSession();
    const now = this.clock.now();
    const startsAt = new Date(input.startsAt);
    if (startsAt.getTime() < now.getTime()) {
      throw new ValidationError('Choose a start time that has not passed.', {
        startsAt: ['Choose a start time that has not passed.'],
      });
    }

    try {
      const slot = await this.em.transactional(async (tx) => {
        const profile = await this.ownerProfile(tx, session.userId);
        const activeCount = await tx.count(Slot, {
          mentorProfile: profile.id,
          removedAt: null,
        });
        if (activeCount >= MAX_ACTIVE_SLOTS) {
          throw new ValidationError(`You can publish up to ${MAX_ACTIVE_SLOTS} active times.`, {
            startsAt: ['Remove an existing time before publishing another.'],
          });
        }
        const created = tx.create(Slot, { mentorProfile: profile, startsAt, removedAt: null });
        profile.lastPublishedAvailabilityAt = now;
        tx.persist(created);
        await tx.flush();
        return created;
      });
      const dto = toOwnerDto(slot, now);
      await this.eventBus.emit('availability.slot.published', {
        mentorProfileId: slot.mentorProfile.id,
        slotId: slot.id,
        startsAt: dto.startsAt,
      });
      return dto;
    } catch (error) {
      if (constraintName(error) === ACTIVE_SLOT_CONSTRAINT) {
        throw new ConflictError('This start time is already published.');
      }
      throw error;
    }
  }

  async remove(id: string): Promise<{ id: string }> {
    const session = await this.mentorSession();
    const now = this.clock.now();
    return this.em.transactional(async (tx) => {
      const slot = await tx.findOne(
        Slot,
        { id, mentorProfile: { user: session.userId }, removedAt: null },
        { lockMode: LockMode.PESSIMISTIC_WRITE },
      );
      if (slot === null) throw new NotFoundError('Slot not found.');
      slot.removedAt = now;
      await tx.flush();
      return { id: slot.id };
    });
  }

  async listPublic(mentorProfileId: string): Promise<SlotPublicDto[]> {
    const now = this.clock.now();
    const leadTimeBoundary = now.getTime() + LEAD_TIME_MS;
    const slots = await this.em.find(
      Slot,
      { mentorProfile: mentorProfileId, removedAt: null, startsAt: { $gte: now } },
      { orderBy: { startsAt: 'asc' }, limit: MAX_ACTIVE_SLOTS },
    );
    return slots.map((slot) => ({
      id: slot.id,
      startsAt: slot.startsAt.toISOString(),
      meetsLeadTime: slot.startsAt.getTime() >= leadTimeBoundary,
    }));
  }
}
