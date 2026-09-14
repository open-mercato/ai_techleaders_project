import { describe, expect, it } from 'vitest';
import type { AppEnv } from '../../config/env';
import {
  PLATFORM_SETTINGS_UNAVAILABLE_MESSAGE,
  PlatformSettingsService,
} from './platform-settings.service';

const validEnv = {
  PLATFORM_CURRENCY: 'PLN',
  PLATFORM_PRICE_BOUNDS: {
    p25: { minCents: 9_000, maxCents: 60_000 },
    p50: { minCents: 18_000, maxCents: 120_000 },
  },
  PLATFORM_FEE_PERCENT: 20,
} as unknown as AppEnv;

function service(overrides: Record<string, unknown> = {}) {
  return new PlatformSettingsService({ env: { ...validEnv, ...overrides } as AppEnv });
}

describe('PlatformSettingsService', () => {
  it('returns the approved resolved policy and each duration bound', () => {
    expect(service().get()).toEqual({
      currency: 'PLN',
      priceBounds: {
        p25: { minCents: 9_000, maxCents: 60_000 },
        p50: { minCents: 18_000, maxCents: 120_000 },
      },
      feePercent: 20,
    });
    expect(service().boundsFor('25')).toEqual({ minCents: 9_000, maxCents: 60_000 });
    expect(service().boundsFor('50')).toEqual({ minCents: 18_000, maxCents: 120_000 });
  });

  it('fails closed for missing, malformed, unsupported or inconsistent resolved policy', () => {
    const invalid = [
      { PLATFORM_CURRENCY: undefined },
      { PLATFORM_CURRENCY: 'EUR' },
      { PLATFORM_PRICE_BOUNDS: undefined },
      { PLATFORM_PRICE_BOUNDS: 'not-an-object' },
      { PLATFORM_PRICE_BOUNDS: { p25: validEnv.PLATFORM_PRICE_BOUNDS.p25 } },
      { PLATFORM_PRICE_BOUNDS: { ...validEnv.PLATFORM_PRICE_BOUNDS, extra: true } },
      { PLATFORM_PRICE_BOUNDS: { ...validEnv.PLATFORM_PRICE_BOUNDS, p25: { minCents: 0, maxCents: 1 } } },
      { PLATFORM_PRICE_BOUNDS: { ...validEnv.PLATFORM_PRICE_BOUNDS, p25: { minCents: 1.5, maxCents: 2 } } },
      { PLATFORM_PRICE_BOUNDS: { ...validEnv.PLATFORM_PRICE_BOUNDS, p25: { minCents: 1, maxCents: 2_147_483_648 } } },
      { PLATFORM_PRICE_BOUNDS: { ...validEnv.PLATFORM_PRICE_BOUNDS, p25: { minCents: 2, maxCents: 1 } } },
      { PLATFORM_PRICE_BOUNDS: { ...validEnv.PLATFORM_PRICE_BOUNDS, p25: { minCents: 1, maxCents: 2, extra: 3 } } },
    ];

    for (const overrides of invalid) {
      expect(() => service(overrides).get()).toThrow(expect.objectContaining({
        status: 503,
        code: 'service_unavailable',
        message: PLATFORM_SETTINGS_UNAVAILABLE_MESSAGE,
      }));
    }
  });
});

describe('PlatformSettingsService.splitFor', () => {
  function withFee(feePercent: number) {
    return service({ PLATFORM_FEE_PERCENT: feePercent });
  }

  it('keeps 20% and leaves the rest to the mentor (D11)', () => {
    expect(withFee(20).splitFor(9_000)).toEqual({
      platformFeeCents: 1_800,
      mentorShareCents: 7_200,
    });
  });

  it.each([999, 1, 7, 12_345, 100_000])(
    'always sums back to the price, whatever the rounding did (%i)',
    (priceCents) => {
      const split = withFee(20).splitFor(priceCents);

      // The share is the remainder, never a second percentage: rounding two percentages
      // independently would leave or invent a cent.
      expect(split.platformFeeCents + split.mentorShareCents).toBe(priceCents);
    },
  );

  it('rounds the fee to the nearest cent', () => {
    // 20% of 999 is 199.8.
    expect(withFee(20).splitFor(999).platformFeeCents).toBe(200);
  });

  it.each([0, 100])('honours a fee of %i percent at the ends of the range', (feePercent) => {
    const split = withFee(feePercent).splitFor(10_000);

    expect(split.platformFeeCents).toBe(feePercent === 0 ? 0 : 10_000);
    expect(split.mentorShareCents).toBe(feePercent === 0 ? 10_000 : 0);
  });

  it('reports a configured fee alongside the rest of the settings', () => {
    expect(withFee(15).get().feePercent).toBe(15);
  });

  it('refuses a fee outside the range rather than splitting by it', () => {
    expect(() => withFee(120).get()).toThrow(PLATFORM_SETTINGS_UNAVAILABLE_MESSAGE);
  });
});
