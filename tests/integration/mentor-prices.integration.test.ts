import { resolve } from 'node:path';
import { MentorProfile, MikroORM, entities } from '@devmentor/db';
import { describe, expect, inject, it } from 'vitest';
import {
  captureBrowserFailure,
  closeAgentBrowser,
  integrationArtifactsDirectory,
  runAgentBrowser,
  signInCookieHeader,
} from './agent-browser';
import { expectAbsent } from './assertions';
import {
  resetPublishedMentorProfile,
  seedFutureMentorSlot,
  seedOfferReadyMentor,
  seedPublishedMentorProfile,
} from './fixtures/mentor';

const CSRF_HEADERS = {
  'content-type': 'application/json',
  'x-devmentor-request': '1',
};

interface Prices {
  price25Cents: number;
  price50Cents: number;
  currency: string;
}

interface OwnerPayload {
  prices: Prices | null;
  priceCurrency: string;
  priceBounds: {
    p25: { minCents: number; maxCents: number };
    p50: { minCents: number; maxCents: number };
  };
  offerReadiness: { ready: boolean };
}

interface PublicPayload {
  displayName: string;
  publicWorkUrl: string;
  bio: string;
  stackTags: string[];
  slug: string;
  slots: { id: string; startsAt: string; meetsLeadTime: boolean }[];
  prices: Prices | null;
}

async function responseData<T>(response: Response): Promise<T> {
  expect(response.status).toBe(200);
  const payload = (await response.json()) as { ok: true; data: T };
  expect(payload.ok).toBe(true);
  return payload.data;
}

async function updatePrices(baseUrl: string, cookie: string, price25: string, price50: string) {
  return fetch(`${baseUrl}/api/mentors/me/prices`, {
    method: 'PUT',
    headers: { ...CSRF_HEADERS, cookie },
    body: JSON.stringify({ price25, price50 }),
  });
}

describe('TC-MENTOR-PRICES-001 exact owner price policy', () => {
  it('stores inclusive bounds exactly, rejects all four breaches atomically and projects by audience', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const databaseUrl = inject('integrationDatabaseUrl');
    let orm: MikroORM | undefined;

    try {
      const mentor = await seedPublishedMentorProfile(databaseUrl);
      orm = await MikroORM.init({ clientUrl: databaseUrl, entities });
      await orm.connect();
      const connectedOrm = orm;
      const storedPrices = async () => {
        const profile = await connectedOrm.em.fork().findOneOrFail(MentorProfile, { id: mentor.profileId });
        return [profile.price25Cents, profile.price50Cents];
      };
      const cookie = await signInCookieHeader(baseUrl, 'mock-mentor');

      const lower = await responseData<OwnerPayload>(
        await updatePrices(baseUrl, cookie, '90.00', '180.00'),
      );
      expect(lower.prices).toEqual({
        price25Cents: 9_000,
        price50Cents: 18_000,
        currency: 'PLN',
      });
      expect(await storedPrices()).toEqual([9_000, 18_000]);

      const upper = await responseData<OwnerPayload>(
        await updatePrices(baseUrl, cookie, '600.00', '1200.00'),
      );
      expect(upper.prices).toEqual({
        price25Cents: 60_000,
        price50Cents: 120_000,
        currency: 'PLN',
      });
      expect(await storedPrices()).toEqual([60_000, 120_000]);

      await responseData<OwnerPayload>(await updatePrices(baseUrl, cookie, '100.00', '200.00'));
      const baseline = [10_000, 20_000];
      expect(await storedPrices()).toEqual(baseline);

      for (const refusal of [
        { price25: '89.99', price50: '210.00', field: 'price25', message: 'Enter an amount from PLN 90.00 to PLN 600.00.' },
        { price25: '600.01', price50: '210.00', field: 'price25', message: 'Enter an amount from PLN 90.00 to PLN 600.00.' },
        { price25: '110.00', price50: '179.99', field: 'price50', message: 'Enter an amount from PLN 180.00 to PLN 1200.00.' },
        { price25: '110.00', price50: '1200.01', field: 'price50', message: 'Enter an amount from PLN 180.00 to PLN 1200.00.' },
      ]) {
        const response = await updatePrices(baseUrl, cookie, refusal.price25, refusal.price50);
        expect(response.status).toBe(422);
        const payload = (await response.json()) as {
          ok: false;
          error: { code: string; fieldErrors: Record<string, string[]> };
        };
        expect(payload).toMatchObject({
          ok: false,
          error: {
            code: 'validation_failed',
            fieldErrors: { [refusal.field]: [refusal.message] },
          },
        });
        expect(Object.keys(payload.error.fieldErrors)).toEqual([refusal.field]);
        expect(await storedPrices()).toEqual(baseline);
      }

      const owner = await responseData<OwnerPayload>(await fetch(`${baseUrl}/api/mentors/me`, {
        headers: { cookie },
      }));
      expect(owner.prices).toEqual({
        price25Cents: baseline[0],
        price50Cents: baseline[1],
        currency: 'PLN',
      });
      expect(owner.priceCurrency).toBe('PLN');
      expect(owner.priceBounds).toEqual({
        p25: { minCents: 9_000, maxCents: 60_000 },
        p50: { minCents: 18_000, maxCents: 120_000 },
      });
      expect(owner.offerReadiness.ready).toBe(true);

      const publicProfile = await responseData<PublicPayload>(
        await fetch(`${baseUrl}/api/mentors/${mentor.slug}`),
      );
      expect(Object.keys(publicProfile).sort()).toEqual([
        'bio', 'displayName', 'prices', 'publicWorkUrl', 'slots', 'slug', 'stackTags',
      ]);
      expect(publicProfile.prices).toEqual({
        price25Cents: baseline[0],
        price50Cents: baseline[1],
        currency: 'PLN',
      });
      for (const privateKey of [
        'email', 'invitation', 'initialPublishDueAt', 'priceBounds', 'priceCurrency', 'offerReadiness',
      ]) {
        expect(publicProfile).not.toHaveProperty(privateKey);
      }
    } finally {
      try {
        await orm?.close(true);
      } finally {
        await resetPublishedMentorProfile(databaseUrl);
      }
    }
  });
});

describe('TC-MENTOR-PRICES-002 signed-out offer-ready page', () => {
  it('shows exact prices with a future slot and no premature booking or reputation UI', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const databaseUrl = inject('integrationDatabaseUrl');
    const session = `devmentor-offer-ready-${process.pid}`;

    try {
      const mentor = await seedOfferReadyMentor(databaseUrl);
      const publicProfile = await responseData<PublicPayload>(
        await fetch(`${baseUrl}/api/mentors/${mentor.slug}`),
      );
      expect(publicProfile.prices).toEqual({
        price25Cents: mentor.price25Cents,
        price50Cents: mentor.price50Cents,
        currency: mentor.currency,
      });
      expect(publicProfile.slots).toEqual([
        { id: mentor.slotId, startsAt: mentor.startsAt, meetsLeadTime: true },
      ]);

      await runAgentBrowser(session, 'open', `${baseUrl}/m/${mentor.slug}`);
      const snapshot = await runAgentBrowser(session, 'snapshot');
      expect(snapshot).toContain('heading "Mock Mentor"');
      expect(snapshot).toContain('heading "Session prices"');
      expect(snapshot).toContain('25 minutes: PLN 90.00');
      expect(snapshot).toContain('50 minutes: PLN 180.00');
      expect(snapshot).toContain('heading "Available times"');
      await expect(runAgentBrowser(session, 'get', 'text', '[role="status"]'))
        .resolves.toBe('Available');
      await expect(runAgentBrowser(session, 'get', 'attr', 'time', 'datetime'))
        .resolves.toBe(mentor.startsAt);
      expectAbsent(
        snapshot,
        { text: /rating|review|score|ranking/i },
        { tree: 'the signed-out offer-ready mentor page', provenBy: [{ role: 'heading', text: 'Session prices' }] },
      );
      expectAbsent(
        snapshot,
        { role: 'button', text: /book|checkout|choose a time/i },
        { tree: 'the signed-out offer-ready mentor page', provenBy: [{ role: 'heading', text: 'Available times' }] },
      );
      expectAbsent(
        snapshot,
        { role: 'link', text: /book|checkout|choose a time/i },
        { tree: 'the signed-out offer-ready mentor page', provenBy: [{ role: 'heading', text: 'Available times' }] },
      );
      await runAgentBrowser(
        session,
        'screenshot',
        resolve(integrationArtifactsDirectory, 'mentor-offer-ready-public-desktop.png'),
        '--full',
      );
    } catch (error) {
      await captureBrowserFailure(session, 'mentor-offer-ready-public');
      throw error;
    } finally {
      await closeAgentBrowser(session);
      await resetPublishedMentorProfile(databaseUrl);
    }
  });
});

describe('TC-MENTOR-PRICES-003 unpriced availability', () => {
  it('keeps a future slot public while withholding booking actions and private data', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const databaseUrl = inject('integrationDatabaseUrl');
    const session = `devmentor-unpriced-slot-${process.pid}`;

    try {
      const mentor = await seedPublishedMentorProfile(databaseUrl);
      const slot = await seedFutureMentorSlot(databaseUrl, mentor.profileId);
      const publicProfile = await responseData<PublicPayload>(
        await fetch(`${baseUrl}/api/mentors/${mentor.slug}`),
      );
      expect(Object.keys(publicProfile).sort()).toEqual([
        'bio', 'displayName', 'prices', 'publicWorkUrl', 'slots', 'slug', 'stackTags',
      ]);
      expect(publicProfile.prices).toBeNull();
      expect(publicProfile.slots).toEqual([
        { id: slot.slotId, startsAt: slot.startsAt, meetsLeadTime: true },
      ]);
      expect(publicProfile).not.toHaveProperty('priceBounds');
      expect(publicProfile).not.toHaveProperty('initialPublishDueAt');
      expect(publicProfile).not.toHaveProperty('email');

      await runAgentBrowser(session, 'open', `${baseUrl}/m/${mentor.slug}`);
      const snapshot = await runAgentBrowser(session, 'snapshot');
      expect(snapshot).toContain('heading "Mock Mentor"');
      expect(snapshot).toContain('Not bookable yet');
      expect(snapshot).toContain('heading "Available times"');
      await expect(runAgentBrowser(session, 'get', 'text', '[role="status"]'))
        .resolves.toBe('Available');
      await expect(runAgentBrowser(session, 'get', 'attr', 'time', 'datetime'))
        .resolves.toBe(slot.startsAt);
      expectAbsent(
        snapshot,
        { text: /rating|review|score|ranking/i },
        { tree: 'the signed-out unpriced mentor page', provenBy: [{ role: 'heading', text: 'Mock Mentor' }, { text: 'Not bookable yet' }] },
      );
      expectAbsent(
        snapshot,
        { role: 'button', text: /book|checkout|choose a time/i },
        { tree: 'the signed-out unpriced mentor page', provenBy: [{ role: 'heading', text: 'Available times' }] },
      );
      expectAbsent(
        snapshot,
        { role: 'link', text: /book|checkout|choose a time/i },
        { tree: 'the signed-out unpriced mentor page', provenBy: [{ role: 'heading', text: 'Available times' }] },
      );
      await runAgentBrowser(
        session,
        'screenshot',
        resolve(integrationArtifactsDirectory, 'mentor-unpriced-with-slot-public.png'),
        '--full',
      );
    } catch (error) {
      await captureBrowserFailure(session, 'mentor-unpriced-with-slot-public');
      throw error;
    } finally {
      await closeAgentBrowser(session);
      await resetPublishedMentorProfile(databaseUrl);
    }
  });
});
