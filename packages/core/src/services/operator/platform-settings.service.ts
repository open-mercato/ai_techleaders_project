import { z } from 'zod';
import type { AppEnv } from '../../config/env';
import type { PriceBounds } from '../../money/money';
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
}).strict();

export interface PlatformSettings {
  currency: 'PLN';
  priceBounds: { p25: PriceBounds; p50: PriceBounds };
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
}
