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
} as AppEnv;

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
