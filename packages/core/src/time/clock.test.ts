import { describe, expect, it } from 'vitest';
import { systemClock, type Clock } from './clock';

/**
 * A stand-in for the auth services: it takes `{ clock }` the way awilix PROXY mode
 * hands over the cradle, reads it internally, and exposes no `now` parameter.
 */
class ExpiryService {
  private readonly clock: Clock;

  constructor({ clock }: { clock: Clock }) {
    this.clock = clock;
  }

  expiresAt(ttlMs: number): Date {
    return new Date(this.clock.now().getTime() + ttlMs);
  }
}

describe('systemClock', () => {
  it('returns a Date', () => {
    expect(systemClock.now()).toBeInstanceOf(Date);
  });

  it('tracks real time, bracketed by two Date.now() reads', () => {
    const before = Date.now();
    const observed = systemClock.now().getTime();
    const after = Date.now();

    expect(observed).toBeGreaterThanOrEqual(before);
    expect(observed).toBeLessThanOrEqual(after);
  });

  it('returns a fresh instance on every call, never a shared mutable Date', () => {
    expect(systemClock.now()).not.toBe(systemClock.now());
  });

  it('serialises as a UTC instant, per the timezone rule', () => {
    expect(systemClock.now().toISOString()).toMatch(/Z$/);
  });
});

describe('an injected clock', () => {
  it('is honoured by a consumer that takes `{ clock }`', () => {
    const fixed = new Date('2026-09-04T12:00:00.000Z');
    const fixedClock: Clock = { now: () => fixed };

    const service = new ExpiryService({ clock: fixedClock });

    expect(service.expiresAt(24 * 60 * 60 * 1000).toISOString()).toBe(
      '2026-09-05T12:00:00.000Z',
    );
    // Deterministic: the same call twice cannot drift, unlike the system clock.
    expect(service.expiresAt(0).toISOString()).toBe(fixed.toISOString());
  });

  it('lets a test advance time without sleeping', () => {
    let current = new Date('2026-09-04T12:00:00.000Z');
    const movableClock: Clock = { now: () => current };
    const service = new ExpiryService({ clock: movableClock });

    const first = service.expiresAt(0);
    current = new Date('2026-09-05T12:00:00.000Z');
    const second = service.expiresAt(0);

    expect(second.getTime() - first.getTime()).toBe(24 * 60 * 60 * 1000);
  });
});
