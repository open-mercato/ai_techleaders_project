import { EventBus, SlotService, type Logger } from '@devmentor/core';
import { MentorProfile, MikroORM, Slot, entities } from '@devmentor/db';
import { resolve } from 'node:path';
import { describe, expect, inject, it } from 'vitest';
import {
  captureBrowserFailure,
  closeAgentBrowser,
  integrationArtifactsDirectory,
  runAgentBrowser,
  signInCookieHeader,
} from './agent-browser';
import {
  resetPublishedMentorProfile,
  seedFutureMentorSlot,
  seedPublishedMentorProfile,
} from './fixtures/mentor';

const CSRF_HEADERS = {
  'content-type': 'application/json',
  'x-devmentor-request': '1',
};
const EXACT_BOUNDARY_NOW = new Date('2030-01-15T16:00:00.000Z');

function browserSession(scenario: string): string {
  return `devmentor-availability-${scenario}-${process.pid}`;
}

describe('TC-AVAILABILITY-001 published slot lifecycle', () => {
  it('publishes, shows, removes and republishes the same start time', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const databaseUrl = inject('integrationDatabaseUrl');
    const session = browserSession('lifecycle');
    const mentor = await seedPublishedMentorProfile(databaseUrl);
    const startsAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    try {
      const cookie = await signInCookieHeader(baseUrl, 'mock-mentor');
      const publish = await fetch(`${baseUrl}/api/availability/slots`, {
        method: 'POST',
        headers: { ...CSRF_HEADERS, cookie },
        body: JSON.stringify({ startsAt }),
      });
      expect(publish.status).toBe(200);
      const first = (await publish.json()) as { data: { id: string; startsAt: string } };
      expect(first.data.startsAt).toBe(startsAt);

      let publicResponse = await fetch(`${baseUrl}/api/mentors/${mentor.slug}`);
      expect(publicResponse.status).toBe(200);
      let publicPayload = (await publicResponse.json()) as {
        data: { slots: { id: string; startsAt: string; meetsLeadTime: boolean }[] };
      };
      expect(publicPayload.data.slots).toEqual([
        { id: first.data.id, startsAt, meetsLeadTime: true },
      ]);

      await runAgentBrowser(session, 'open', `${baseUrl}/m/${mentor.slug}`);
      let snapshot = await runAgentBrowser(session, 'snapshot');
      expect(snapshot).toContain('heading "Available times"');
      expect(snapshot).not.toContain('No future times are published.');
      await expect(runAgentBrowser(session, 'get', 'attr', 'time', 'datetime'))
        .resolves.toBe(startsAt);
      await expect(runAgentBrowser(session, 'get', 'text', '[role="status"]'))
        .resolves.toBe('Available');
      await runAgentBrowser(
        session,
        'screenshot',
        resolve(integrationArtifactsDirectory, 'availability-published-slot.png'),
        '--full',
      );

      const remove = await fetch(`${baseUrl}/api/availability/slots/${first.data.id}`, {
        method: 'DELETE',
        headers: { ...CSRF_HEADERS, cookie },
      });
      expect(remove.status).toBe(200);

      publicResponse = await fetch(`${baseUrl}/api/mentors/${mentor.slug}`);
      expect(publicResponse.status).toBe(200);
      publicPayload = (await publicResponse.json()) as typeof publicPayload;
      expect(publicPayload.data.slots).toEqual([]);
      await runAgentBrowser(session, 'open', `${baseUrl}/m/${mentor.slug}`);
      snapshot = await runAgentBrowser(session, 'snapshot');
      expect(snapshot).toContain('No future times are published. Check this page again later.');

      const republish = await fetch(`${baseUrl}/api/availability/slots`, {
        method: 'POST',
        headers: { ...CSRF_HEADERS, cookie },
        body: JSON.stringify({ startsAt }),
      });
      expect(republish.status).toBe(200);
      const second = (await republish.json()) as { data: { id: string; startsAt: string } };
      expect(second.data.id).not.toBe(first.data.id);
      expect(second.data.startsAt).toBe(startsAt);

      publicResponse = await fetch(`${baseUrl}/api/mentors/${mentor.slug}`);
      expect(publicResponse.status).toBe(200);
      publicPayload = (await publicResponse.json()) as typeof publicPayload;
      expect(publicPayload.data.slots).toEqual([
        { id: second.data.id, startsAt, meetsLeadTime: true },
      ]);
    } catch (error) {
      await captureBrowserFailure(session, 'availability-lifecycle');
      throw error;
    } finally {
      await closeAgentBrowser(session);
      await resetPublishedMentorProfile(databaseUrl);
    }
  });
});

describe('TC-AVAILABILITY-002 inclusive two-hour lead time', () => {
  it('keeps an exact two-hour slot available and disables it one millisecond later', async () => {
    const databaseUrl = inject('integrationDatabaseUrl');
    const mentor = await seedPublishedMentorProfile(databaseUrl);
    const orm = await MikroORM.init({ clientUrl: databaseUrl, entities });
    await orm.connect();

    try {
      const em = orm.em.fork();
      const startsAt = new Date(EXACT_BOUNDARY_NOW.getTime() + 2 * 60 * 60 * 1000);
      const slot = em.create(Slot, {
        mentorProfile: mentor.profileId,
        startsAt,
        removedAt: null,
      });
      em.persist(slot);
      await em.flush();

      let now = EXACT_BOUNDARY_NOW;
      const logger = { error: () => undefined } as unknown as Logger;
      const service = new SlotService({
        em: orm.em.fork(),
        clock: { now: () => now },
        eventBus: new EventBus({ logger }),
        session: Promise.resolve(null),
      });

      expect(await service.listPublic(mentor.profileId)).toEqual([
        { id: slot.id, startsAt: startsAt.toISOString(), meetsLeadTime: true },
      ]);

      now = new Date(EXACT_BOUNDARY_NOW.getTime() + 1);
      expect(await service.listPublic(mentor.profileId)).toEqual([
        { id: slot.id, startsAt: startsAt.toISOString(), meetsLeadTime: false },
      ]);
    } finally {
      try {
        await orm.close(true);
      } finally {
        await resetPublishedMentorProfile(databaseUrl);
      }
    }
  });
});

describe('TC-AVAILABILITY-003 a start time that has passed', () => {
  it('refuses to publish the slot and writes nothing', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const databaseUrl = inject('integrationDatabaseUrl');
    const mentor = await seedPublishedMentorProfile(databaseUrl);
    const orm = await MikroORM.init({ clientUrl: databaseUrl, entities });
    await orm.connect();

    try {
      const cookie = await signInCookieHeader(baseUrl, 'mock-mentor');
      const response = await fetch(`${baseUrl}/api/availability/slots`, {
        method: 'POST',
        headers: { ...CSRF_HEADERS, cookie },
        body: JSON.stringify({ startsAt: new Date(Date.now() - 60 * 60 * 1000).toISOString() }),
      });
      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({
        ok: false,
        error: {
          code: 'validation_failed',
          message: 'Choose a start time that has not passed.',
          fieldErrors: { startsAt: ['Choose a start time that has not passed.'] },
        },
      });

      const em = orm.em.fork();
      expect(await em.count(Slot, { mentorProfile: mentor.profileId })).toBe(0);
      const profile = await em.findOneOrFail(MentorProfile, { id: mentor.profileId });
      expect(profile.lastPublishedAvailabilityAt).toBeNull();

      const publicResponse = await fetch(`${baseUrl}/api/mentors/${mentor.slug}`);
      expect(publicResponse.status).toBe(200);
      const publicPayload = (await publicResponse.json()) as { data: { slots: unknown[] } };
      expect(publicPayload.data.slots).toEqual([]);
    } finally {
      try {
        await orm.close(true);
      } finally {
        await resetPublishedMentorProfile(databaseUrl);
      }
    }
  });
});

describe('TC-AVAILABILITY-004 a slot inside the two-hour lead time', () => {
  it('shows a signed-out visitor why the time cannot be requested', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const databaseUrl = inject('integrationDatabaseUrl');
    const session = browserSession('lead-time');

    try {
      const mentor = await seedPublishedMentorProfile(databaseUrl);
      const slot = await seedFutureMentorSlot(
        databaseUrl,
        mentor.profileId,
        new Date(Date.now() + 60 * 60 * 1000),
      );

      const publicResponse = await fetch(`${baseUrl}/api/mentors/${mentor.slug}`);
      expect(publicResponse.status).toBe(200);
      const publicPayload = (await publicResponse.json()) as {
        data: { slots: { id: string; startsAt: string; meetsLeadTime: boolean }[] };
      };
      expect(publicPayload.data.slots).toEqual([
        { id: slot.slotId, startsAt: slot.startsAt, meetsLeadTime: false },
      ]);

      await runAgentBrowser(session, 'open', `${baseUrl}/m/${mentor.slug}`);
      const snapshot = await runAgentBrowser(session, 'snapshot');
      expect(snapshot).toContain('heading "Available times"');
      expect(snapshot).toContain(
        'A session must be requested at least two hours before it starts.',
      );
      await expect(runAgentBrowser(session, 'get', 'attr', 'time', 'datetime'))
        .resolves.toBe(slot.startsAt);
      await expect(runAgentBrowser(session, 'get', 'text', '[role="status"]'))
        .resolves.toBe('Unavailable because this time starts in less than two hours.');
      await runAgentBrowser(
        session,
        'screenshot',
        resolve(integrationArtifactsDirectory, 'availability-inside-lead-time.png'),
        '--full',
      );
    } catch (error) {
      await captureBrowserFailure(session, 'availability-lead-time');
      throw error;
    } finally {
      await closeAgentBrowser(session);
      await resetPublishedMentorProfile(databaseUrl);
    }
  });
});
