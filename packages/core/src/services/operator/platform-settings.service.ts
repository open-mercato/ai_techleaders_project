import { z } from 'zod';
import type { AppEnv } from '../../config/env';
import type { Cents, PriceBounds } from '../../money/money';
import type { SessionLength } from '../../domain/vocabularies/session-lengths';
import { ServiceUnavailableError } from '../../http/errors';

const POSTGRES_INTEGER_MAX = 2_147_483_647;
const rangeSchema = z.object({
  minCents: z.number().int().positive().max(POSTGRES_INTEGER_MAX),
  maxCents: z.number().int().positive().max(POSTGRES_INTEGER_MAX),
}).strict().refine((range) => range.minCents <= range.maxCents);
const settingsSchema = z.object({
  currency: z.literal('PLN'),
  priceBounds: z.object({ p25: rangeSchema, p50: rangeSchema }).strict(),
  feePercent: z.number().int().min(0).max(100),
}).strict();

export interface PlatformSettings {
  currency: 'PLN';
  priceBounds: { p25: PriceBounds; p50: PriceBounds };
  /** DevMentor's share of a paid session, in whole percent (D11, R10). */
  feePercent: number;
}

/** What DevMentor keeps and what the mentor is owed, from one price. */
export interface FeeSplit {
  platformFeeCents: Cents;
  mentorShareCents: Cents;
}

export const PLATFORM_SETTINGS_UNAVAILABLE_MESSAGE =
  'Platform pricing is temporarily unavailable. Please try again.';

/** The single policy boundary E05 can later replace without changing price consumers. */
export class PlatformSettingsService {
  private readonly env: AppEnv;

  constructor({ env }: { env: AppEnv }) {
    this.env = env;
  }

  get(): PlatformSettings {
    const parsed = settingsSchema.safeParse({
      currency: this.env.PLATFORM_CURRENCY,
      priceBounds: this.env.PLATFORM_PRICE_BOUNDS,
      feePercent: this.env.PLATFORM_FEE_PERCENT,
    });
    if (!parsed.success) {
      throw new ServiceUnavailableError(PLATFORM_SETTINGS_UNAVAILABLE_MESSAGE);
    }
    return parsed.data;
  }

  boundsFor(length: SessionLength): PriceBounds {
    const { priceBounds } = this.get();
    return length === '25' ? priceBounds.p25 : priceBounds.p50;
  }

  /**
   * Split a price into DevMentor's fee and the mentor's share (D11, R10).
   *
   * **The share is the remainder, never a second percentage.** Rounding two percentages
   * independently leaves or invents a cent: 20% of 999 is 199.8, and `round(199.8)` plus
   * `round(799.2)` is 200 + 799 = 999 only by luck. Taking the fee and subtracting it makes
   * the two always sum back to the price, whatever the rounding did.
   */
  splitFor(priceCents: Cents): FeeSplit {
    const platformFeeCents = Math.round((priceCents * this.get().feePercent) / 100);
    return { platformFeeCents, mentorShareCents: priceCents - platformFeeCents };
  }
}
