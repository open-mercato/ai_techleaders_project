import { resolve } from 'node:path';
import {
  EventBus,
  MentorProfileService,
  type SlotService,
  type Logger,
  type Session,
} from '@devmentor/core';
import {
  LockMode,
  MentorProfile,
  MikroORM,
  User,
  entities,
  type EntityManager,
} from '@devmentor/db';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import {
  captureBrowserFailure,
  closeAgentBrowser,
  integrationArtifactsDirectory,
  runAgentBrowser,
  signInAs,
  signInCookieHeader,
} from './agent-browser';
import { expectAbsent } from './assertions';
import {
  resetPublishedMentorProfile,
  seedMentorProfileMissingPublicWorkUrl,
  seedPublishedMentorProfile,
} from './fixtures/mentor';

const CSRF_HEADERS = {
  'content-type': 'application/json',
  'x-devmentor-request': '1',
};
const NOW = new Date('2026-09-10T12:00:00.000Z');
const RACE_PREFIX = `mentor-page-race-${process.pid}-`;
const PUBLISH_GATE_KEY = 2_026_092_001;

describe('TC-MENTOR-PAGE-001 stable public mentor page', () => {
  it('publishes, hides and republishes one share link visible to a signed-out visitor', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const databaseUrl = inject('integrationDatabaseUrl');
    const session = `devmentor-page-${process.pid}`;
    const seeded = await seedPublishedMentorProfile(databaseUrl);

    try {
      const cookie = await signInCookieHeader(baseUrl, 'mock-mentor');
      const unpublish = await fetch(`${baseUrl}/api/mentors/me/unpublish`, {
        method: 'POST',
        headers: { ...CSRF_HEADERS, cookie },
      });
      expect(unpublish.status).toBe(200);
      expect((await fetch(`${baseUrl}/api/mentors/${seeded.slug}`)).status).toBe(404);

      const publish = await fetch(`${baseUrl}/api/mentors/me/publish`, {
        method: 'POST',
        headers: { ...CSRF_HEADERS, cookie },
      });
      expect(publish.status).toBe(200);
      const payload = (await publish.json()) as { data: { slug: string } };
      expect(payload.data.slug).toBe(seeded.slug);

      const publicResponse = await fetch(`${baseUrl}/api/mentors/${seeded.slug}`);
      expect(publicResponse.status).toBe(200);
      const publicPayload = (await publicResponse.json()) as { data: Record<string, unknown> };
      expect(Object.keys(publicPayload.data).sort()).toEqual([
        'bio', 'displayName', 'prices', 'publicWorkUrl', 'slots', 'slug', 'stackTags',
      ]);

      await runAgentBrowser(session, 'open', `${baseUrl}/m/${seeded.slug}`);
      const snapshot = await runAgentBrowser(session, 'snapshot');
      expect(snapshot).toContain('Mock Mentor');
      expect(snapshot).toContain(seeded.bio);
      expect(snapshot).toContain('TypeScript');
      expect(snapshot).toContain('AI agents');
      expect(
        await runAgentBrowser(session, 'get', 'attr', 'a[href*="github.com/open-mercato"]', 'href'),
      ).toBe(seeded.publicWorkUrl);
      expectAbsent(
        snapshot,
        { text: /rating|review|score|ranking/i },
        { tree: 'the signed-out public mentor page', provenBy: [{ role: 'heading', text: 'Mock Mentor' }] },
      );
      await runAgentBrowser(
        session,
        'screenshot',
        resolve(integrationArtifactsDirectory, 'mentor-public-page.png'),
        '--full',
      );
    } catch (error) {
      await captureBrowserFailure(session, 'mentor-page');
      throw error;
    } finally {
      await closeAgentBrowser(session);
      await resetPublishedMentorProfile(databaseUrl);
    }
  });
});

describe('TC-MENTOR-PAGE-002 publication transaction races', () => {
  let orm: MikroORM;
  const logger = { error: () => undefined } as unknown as Logger;
  const eventBus = new EventBus({ logger });

  function serviceFor(em: EntityManager, userId: string): MentorProfileService {
    const session: Promise<Session> = Promise.resolve({ userId, roles: ['mentor'] });
    const slotService = { listPublic: async () => [] } as unknown as SlotService;
    return new MentorProfileService({ em, clock: { now: () => NOW }, eventBus, session, slotService });
  }

  async function createReadyProfile(suffix: string, displayName: string) {
    const em = orm.em.fork();
    const user = em.create(User, {
      email: `${RACE_PREFIX}${suffix}@devmentor.test`,
      displayName,
      roles: ['mentor'],
      emailVerifiedAt: NOW,
    });
    const profile = em.create(MentorProfile, {
      user,
      headline: '',
      yearsOfExperience: 0,
      publicWorkUrl: 'https://example.com/work',
      bio: 'I built production systems.',
      stackTags: ['TypeScript'],
    });
    em.persist([user, profile]);
    await em.flush();
    return { profileId: profile.id, userId: user.id };
  }

  async function waitForBlocked(fragment: string, count: number): Promise<void> {
    const deadline = Date.now() + 10_000;
    const em = orm.em.fork();
    while (Date.now() < deadline) {
      const rows = await em.execute<Array<{ query: string }>>(
        `select query from pg_stat_activity
          where datname = current_database()
            and cardinality(pg_blocking_pids(pid)) > 0
            and lower(query) like ?`,
        [`%${fragment.toLowerCase()}%`],
      );
      if (rows.length >= count) return;
      await new Promise<void>((resolveReady) => setImmediate(resolveReady));
    }
    throw new Error(`Timed out waiting for ${count} blocked ${fragment} queries`);
  }

  async function cleanRaceRows(): Promise<void> {
    const em = orm.em.fork();
    await em.execute(
      'delete from mentor_profiles where user_id in (select id from users where email like ?)',
      [`${RACE_PREFIX}%`],
    );
    await em.execute('delete from users where email like ?', [`${RACE_PREFIX}%`]);
  }

  beforeAll(async () => {
    orm = await MikroORM.init({
      clientUrl: inject('integrationDatabaseUrl'),
      entities,
      pool: { min: 0, max: 10 },
    });
    await orm.connect();
    await cleanRaceRows();
  });

  afterAll(async () => {
    if (orm) {
      const em = orm.em.fork();
      await em.execute('drop trigger if exists test_hold_mentor_publish on mentor_profiles');
      await em.execute('drop function if exists test_hold_mentor_publish()');
      await cleanRaceRows();
      await orm.close(true);
    }
  });

  it('allocates distinct non-reserved slugs when equal display names publish concurrently', async () => {
    const first = await createReadyProfile('equal-one', 'Same Name');
    const second = await createReadyProfile('equal-two', 'Same Name');
    const control = orm.em.fork();
    await control.execute(`
      create or replace function test_hold_mentor_publish() returns trigger language plpgsql as $$
      begin
        if new.published_at is not null and old.published_at is null then
          perform pg_advisory_xact_lock(${PUBLISH_GATE_KEY});
        end if;
        return new;
      end
      $$
    `);
    await control.execute(`
      create trigger test_hold_mentor_publish before update on mentor_profiles
      for each row execute function test_hold_mentor_publish()
    `);
    const gate = orm.em.fork();
    await gate.begin();
    await gate.execute(`select pg_advisory_xact_lock(${PUBLISH_GATE_KEY})`);

    const settled = Promise.allSettled([
      serviceFor(orm.em.fork(), first.userId).publish(),
      serviceFor(orm.em.fork(), second.userId).publish(),
    ]);
    let waitFailure: unknown;
    try {
      await waitForBlocked('update "mentor_profiles"', 2);
    } catch (error) {
      waitFailure = error;
    } finally {
      await gate.commit();
    }
    const results = await settled;
    await control.execute('drop trigger test_hold_mentor_publish on mentor_profiles');
    await control.execute('drop function test_hold_mentor_publish()');
    if (waitFailure !== undefined) throw waitFailure;

    expect(results.every((result) => result.status === 'fulfilled')).toBe(true);
    const slugs = await orm.em.fork().find(
      MentorProfile,
      { id: { $in: [first.profileId, second.profileId] } },
      { orderBy: { slug: 'asc' } },
    );
    expect(slugs.map(({ slug }) => slug)).toEqual(['same-name', 'same-name-2']);
  });

  it('serializes same-profile publish and publish-before-unpublish transitions', async () => {
    const seeded = await createReadyProfile('same-profile', 'Serial Mentor');
    let publishedEvents = 0;
    const unsubscribe = eventBus.on('mentors.profile.published', () => {
      publishedEvents += 1;
    });
    const gate = orm.em.fork();
    await gate.begin();
    await gate.findOneOrFail(
      MentorProfile,
      { id: seeded.profileId },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    );
    const first = serviceFor(orm.em.fork(), seeded.userId).publish();
    const second = serviceFor(orm.em.fork(), seeded.userId).publish();
    const settled = Promise.allSettled([first, second]);
    await waitForBlocked('from "mentor_profiles"', 2);
    await gate.commit();
    const results = await settled;
    expect(results.every((result) => result.status === 'fulfilled')).toBe(true);
    expect(publishedEvents).toBe(1);

    const reset = orm.em.fork();
    await reset.execute('update mentor_profiles set published_at = null where id = ?', [
      seeded.profileId,
    ]);
    const transitionGate = orm.em.fork();
    await transitionGate.begin();
    await transitionGate.findOneOrFail(
      MentorProfile,
      { id: seeded.profileId },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    );
    const publish = serviceFor(orm.em.fork(), seeded.userId).publish();
    await waitForBlocked('from "mentor_profiles"', 1);
    const unpublish = serviceFor(orm.em.fork(), seeded.userId).unpublish();
    const transitions = Promise.allSettled([publish, unpublish]);
    await waitForBlocked('from "mentor_profiles"', 2);
    await transitionGate.commit();
    expect((await transitions).every((result) => result.status === 'fulfilled')).toBe(true);
    const final = await orm.em.fork().findOneOrFail(MentorProfile, { id: seeded.profileId });
    expect(final.slug).toBe('serial-mentor');
    expect(final.publishedAt).toBeNull();
    unsubscribe();
  });
});

describe('TC-MENTOR-PAGE-003 publish requires a public-work link', () => {
  it('refuses to publish and names the missing link on its field', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const databaseUrl = inject('integrationDatabaseUrl');
    const session = `devmentor-page-missing-link-${process.pid}`;

    try {
      const fixture = await seedMentorProfileMissingPublicWorkUrl(databaseUrl);

      await signInAs(session, baseUrl, 'mock-mentor');
      await runAgentBrowser(session, 'open', `${baseUrl}/mentor/profile`);
      await runAgentBrowser(session, 'wait', '--text', 'Ready to publish?');

      const before = await runAgentBrowser(session, 'snapshot');
      expect(before).toContain('heading "Add a link to your public work."');
      expect(before).toContain('checkbox "TypeScript" [checked=true');
      expect(before).toContain('button "Publish page"');

      await runAgentBrowser(session, 'find', 'role', 'button', 'click', '--name', 'Publish page');
      await runAgentBrowser(session, 'wait', '[role="alert"]');

      await expect(runAgentBrowser(session, 'get', 'text', '[role="alert"]'))
        .resolves.toBe('Add a link to your public work.');
      await expect(runAgentBrowser(session, 'get', 'attr', '[aria-invalid="true"]', 'name'))
        .resolves.toBe('publicWorkUrl');

      const after = await runAgentBrowser(session, 'snapshot');
      expect(after).toContain('button "Publish page"');
      expect(after).not.toContain('button "Unpublish page"');
      await runAgentBrowser(
        session,
        'screenshot',
        resolve(integrationArtifactsDirectory, 'mentor-page-publish-blocked-missing-link.png'),
        '--full',
      );

      const orm = await MikroORM.init({ clientUrl: databaseUrl, entities });
      await orm.connect();
      try {
        const profile = await orm.em.fork().findOneOrFail(MentorProfile, { id: fixture.profileId });
        expect(profile.publishedAt).toBeNull();
        expect(profile.slug).toBeNull();
        expect(profile.publicWorkUrl).toBeNull();
      } finally {
        await orm.close(true);
      }
    } catch (error) {
      await captureBrowserFailure(session, 'mentor-page-missing-link');
      throw error;
    } finally {
      await closeAgentBrowser(session);
      await resetPublishedMentorProfile(databaseUrl);
    }
  });
});
