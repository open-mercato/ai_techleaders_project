import {
  LockMode,
  MentorProfile,
  UniqueConstraintViolationException,
  type EntityManager,
  type IMentorProfile,
} from '@devmentor/db';
import type { EventBus } from '../../events/event-bus';
import {
  ConflictError,
  NotFoundError,
  ServiceUnavailableError,
  UnauthorizedError,
  ValidationError,
} from '../../http/errors';
import { requireRole, type Session } from '../../http/auth';
import { uniqueSlug } from '../../domain/slug';
import type { StackTag } from '../../domain/vocabularies/stack-tags';
import type { Clock } from '../../time/clock';
import type { MentorProfileUpdateInput } from '../../validators/mentors/mentor-profile-update.schema';
import type { MentorPricesUpdateInput } from '../../validators/mentors/mentor-prices-update.schema';
import { parseMajorAmount, withinBounds, type PriceBounds } from '../../money/money';
import type { SlotPublicDto, SlotService } from '../availability/slot.service';
import {
  PLATFORM_SETTINGS_UNAVAILABLE_MESSAGE,
  type PlatformSettings,
  type PlatformSettingsService,
} from '../operator/platform-settings.service';
import { mentorOfferReady, mentorPagePublishable } from './readiness';

const SLUG_CONSTRAINT = 'mentor_profiles_slug_unique';
export const MAX_SLUG_ATTEMPTS = 100;

export interface MentorPricesDto {
  price25Cents: number;
  price50Cents: number;
  currency: string;
}

export interface MentorProfileOwnerDto {
  id: string;
  displayName: string;
  publicWorkUrl: string | null;
  bio: string | null;
  stackTags: readonly StackTag[];
  slug: string | null;
  publishedAt: string | null;
  readiness: ReturnType<typeof mentorPagePublishable.evaluate>;
  /** Optional so existing source-level DTO constructors remain valid. */
  prices?: MentorPricesDto | null;
  priceBounds?: { p25: PriceBounds; p50: PriceBounds };
  offerReadiness?: ReturnType<typeof mentorOfferReady.evaluate>;
}

export interface MentorProfilePublicDto {
  displayName: string;
  publicWorkUrl: string;
  bio: string;
  stackTags: readonly StackTag[];
  slug: string;
  /** Additive availability projection; optional for source compatibility with Slice 2 consumers. */
  slots?: SlotPublicDto[];
  /** Optional for source compatibility; live service projections always include this key. */
  prices?: MentorPricesDto | null;
}

function pricesFor(profile: IMentorProfile, currency: string): MentorPricesDto | null {
  if (profile.price25Cents == null || profile.price50Cents == null) return null;
  return {
    price25Cents: profile.price25Cents,
    price50Cents: profile.price50Cents,
    currency,
  };
}

function offerReadinessFor(profile: IMentorProfile) {
  return mentorOfferReady.evaluate({
    publishedAt: profile.publishedAt ?? null,
    price25Cents: profile.price25Cents ?? null,
    price50Cents: profile.price50Cents ?? null,
  });
}

export function toOwnerDto(
  profile: IMentorProfile,
  settings?: PlatformSettings,
): MentorProfileOwnerDto {
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
    ...(settings === undefined
      ? {}
      : {
          prices: pricesFor(profile, settings.currency),
          priceBounds: settings.priceBounds,
          offerReadiness: offerReadinessFor(profile),
        }),
  };
}

export function toPublicDto(
  profile: IMentorProfile,
  slots: SlotPublicDto[] = [],
  settings?: PlatformSettings,
): MentorProfilePublicDto {
  return {
    displayName: profile.user.displayName,
    publicWorkUrl: profile.publicWorkUrl as string,
    bio: profile.bio as string,
    stackTags: profile.stackTags as StackTag[],
    slug: profile.slug as string,
    slots,
    ...(settings === undefined ? {} : { prices: pricesFor(profile, settings.currency) }),
  };
}

function formatCents(cents: number): string {
  return `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
}

function priceError(bounds: PriceBounds, currency: string): string {
  return `Enter an amount from ${currency} ${formatCents(bounds.minCents)} to ${currency} ${formatCents(bounds.maxCents)}.`;
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
  private readonly slotService: Pick<SlotService, 'listPublic'>;
  private readonly platformSettingsService?: Pick<PlatformSettingsService, 'get'>;

  constructor({
    em,
    clock,
    eventBus,
    session,
    slotService = { listPublic: async () => [] },
    platformSettingsService,
  }: {
    em: EntityManager;
    clock: Clock;
    eventBus: EventBus;
    session: Promise<Session | null>;
    slotService?: Pick<SlotService, 'listPublic'>;
    platformSettingsService?: Pick<PlatformSettingsService, 'get'>;
  }) {
    // Destructure the PROXY cradle synchronously. Retaining it and resolving a key after
    // an await can reach a request scope that has already been disposed.
    this.em = em;
    this.clock = clock;
    this.eventBus = eventBus;
    this.session = session;
    this.slotService = slotService;
    this.platformSettingsService = platformSettingsService;
    void session.catch(() => undefined);
  }

  private settings(): PlatformSettings {
    if (this.platformSettingsService === undefined) {
      throw new ServiceUnavailableError(PLATFORM_SETTINGS_UNAVAILABLE_MESSAGE);
    }
    return this.platformSettingsService.get();
  }

  private ownerDto(profile: IMentorProfile): MentorProfileOwnerDto {
    return toOwnerDto(profile, this.platformSettingsService?.get());
  }

  private publicDto(profile: IMentorProfile, slots: SlotPublicDto[]): MentorProfilePublicDto {
    return toPublicDto(profile, slots, this.platformSettingsService?.get());
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
    return this.ownerDto(await this.ownerProfile(this.em, session.userId));
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
      return this.ownerDto(profile);
    });
  }

  async updatePrices(input: MentorPricesUpdateInput): Promise<MentorProfileOwnerDto> {
    const session = await this.mentorSession();
    const settings = this.settings();
    const parsed = {
      price25: parseMajorAmount(input.price25),
      price50: parseMajorAmount(input.price50),
    };
    const fieldErrors: Record<string, string[]> = {};
    for (const [field, amount, bounds] of [
      ['price25', parsed.price25, settings.priceBounds.p25],
      ['price50', parsed.price50, settings.priceBounds.p50],
    ] as const) {
      if (amount === null) {
        fieldErrors[field] = [
          `Enter a ${settings.currency} amount with no more than two decimal places.`,
        ];
      } else if (!withinBounds(amount, bounds.minCents, bounds.maxCents)) {
        fieldErrors[field] = [priceError(bounds, settings.currency)];
      }
    }
    if (Object.keys(fieldErrors).length > 0) {
      throw new ValidationError('Choose prices within the platform bounds.', fieldErrors);
    }

    return this.em.transactional(async (tx) => {
      const profile = await this.ownerProfile(tx, session.userId, true);
      profile.price25Cents = parsed.price25 as number;
      profile.price50Cents = parsed.price50 as number;
      await tx.flush();
      return toOwnerDto(profile, settings);
    });
  }

  async publish(): Promise<MentorProfileOwnerDto> {
    const session = await this.mentorSession();

    for (let attempt = 1; attempt <= MAX_SLUG_ATTEMPTS; attempt += 1) {
      try {
        const outcome = await this.em.transactional(
          async (tx) => {
            const profile = await this.ownerProfile(tx, session.userId, true);
            if (profile.publishedAt !== null) return { dto: this.ownerDto(profile), published: false };

            mentorPagePublishable.assert({
              publicWorkUrl: profile.publicWorkUrl ?? null,
              bio: profile.bio ?? null,
              stackTags: profile.stackTags as StackTag[],
            });
            if (profile.slug === null) profile.slug = uniqueSlug(profile.user.displayName, attempt);
            profile.publishedAt = this.clock.now();
            await tx.flush();
            return { dto: this.ownerDto(profile), published: true };
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
      return this.ownerDto(profile);
    });
  }

  async getPublicBySlug(slug: string): Promise<MentorProfilePublicDto> {
    const profile = await this.em.findOne(
      MentorProfile,
      { slug, publishedAt: { $ne: null } },
      { populate: ['user'] },
    );
    if (profile === null) throw new NotFoundError('Mentor page not found.');
    return this.publicDto(profile, await this.slotService.listPublic(profile.id));
  }
}
