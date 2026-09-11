import { resolve } from 'node:path';
import { MentorProfile, MikroORM, entities } from '@devmentor/db';
import { describe, expect, inject, it } from 'vitest';
import {
  captureBrowserFailure,
  closeAgentBrowser,
  integrationArtifactsDirectory,
  runAgentBrowser,
  signInAs,
  signInCookieHeader,
} from './agent-browser';
import {
  resetPublishedMentorProfile,
  seedEmptyMentorProfileDraft,
  seedMentorProfileMissingStackTags,
  seedPublishedMentorProfile,
} from './fixtures/mentor';

describe('TC-MENTOR-PROFILE-001 publish requires at least one technology', () => {
  it('refuses to publish the mentor page when no technology is selected', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const databaseUrl = inject('integrationDatabaseUrl');
    const session = `devmentor-profile-publish-${process.pid}`;

    try {
      const fixture = await seedMentorProfileMissingStackTags(databaseUrl);

      await signInAs(session, baseUrl, 'mock-mentor');
      await runAgentBrowser(session, 'open', `${baseUrl}/mentor/profile`);
      await runAgentBrowser(session, 'wait', '--text', 'Ready to publish?');

      const before = await runAgentBrowser(session, 'snapshot');
      expect(before).toContain('heading "Mentor profile"');
      expect(before).toContain('button "Publish page"');
      expect(before).toContain('heading "Choose at least one technology."');

      await runAgentBrowser(session, 'find', 'role', 'button', 'click', '--name', 'Publish page');
      await runAgentBrowser(session, 'wait', '[role="alert"]');

      const fieldError = await runAgentBrowser(session, 'get', 'text', '[role="alert"]');
      expect(fieldError).toBe('Choose at least one technology.');

      const after = await runAgentBrowser(session, 'snapshot');
      expect(after).toContain('button "Publish page"');
      expect(after).not.toContain('button "Unpublish page"');

      await runAgentBrowser(
        session,
        'screenshot',
        resolve(integrationArtifactsDirectory, 'mentor-profile-publish-blocked-missing-technology.png'),
        '--full',
      );

      const orm = await MikroORM.init({ clientUrl: databaseUrl, entities });
      await orm.connect();
      try {
        const profile = await orm.em.fork().findOneOrFail(MentorProfile, { id: fixture.profileId });
        expect(profile.publishedAt).toBeNull();
        expect(profile.slug).toBeNull();
        expect(profile.stackTags).toEqual([]);
      } finally {
        await orm.close(true);
      }
    } catch (error) {
      await captureBrowserFailure(session, 'mentor-profile-publish-blocked');
      throw error;
    } finally {
      await closeAgentBrowser(session);
      await resetPublishedMentorProfile(databaseUrl);
    }
  });
});

describe('TC-MENTOR-PROFILE-002 save then publish from the editor', () => {
  it('publishes the saved details and shows them to a signed-out visitor through the share link', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const databaseUrl = inject('integrationDatabaseUrl');
    const mentorSession = `devmentor-profile-save-${process.pid}`;
    const visitorSession = `devmentor-profile-visitor-${process.pid}`;
    const publicWorkUrl = 'https://github.com/open-mercato';
    const bio = 'I review TypeScript services and help teams ship reliable releases.';

    try {
      const fixture = await seedEmptyMentorProfileDraft(databaseUrl);

      await signInAs(mentorSession, baseUrl, 'mock-mentor');
      await runAgentBrowser(mentorSession, 'open', `${baseUrl}/mentor/profile`);
      await runAgentBrowser(mentorSession, 'wait', '--text', 'Ready to publish?');

      await runAgentBrowser(mentorSession, 'find', 'label', 'Public work link', 'fill', publicWorkUrl);
      await runAgentBrowser(mentorSession, 'find', 'label', 'About your work', 'fill', bio);
      await runAgentBrowser(mentorSession, 'find', 'role', 'checkbox', 'check', '--name', 'React');
      await runAgentBrowser(mentorSession, 'find', 'role', 'button', 'click', '--name', 'Save profile');
      // The preview renders only once the saved profile has reloaded as publishable.
      await runAgentBrowser(mentorSession, 'wait', '--text', 'Page preview');

      await runAgentBrowser(mentorSession, 'find', 'role', 'button', 'click', '--name', 'Publish page');
      await runAgentBrowser(mentorSession, 'wait', '--text', 'Your share link');

      const published = await runAgentBrowser(mentorSession, 'snapshot');
      expect(published).toContain('heading "Your share link"');
      expect(published).toContain('button "Unpublish page"');
      expect(published).not.toContain('button "Publish page"');
      const shareUrl = await runAgentBrowser(mentorSession, 'get', 'attr', 'a[href*="/m/"]', 'href');
      expect(shareUrl).toMatch(new RegExp(`^${baseUrl}/m/[a-z0-9-]+$`));
      await runAgentBrowser(
        mentorSession,
        'screenshot',
        resolve(integrationArtifactsDirectory, 'mentor-profile-saved-and-published.png'),
        '--full',
      );

      await runAgentBrowser(visitorSession, 'open', shareUrl);
      const visitor = await runAgentBrowser(visitorSession, 'snapshot');
      expect(visitor).toContain('heading "Mock Mentor"');
      expect(visitor).toContain(`StaticText "${bio}"`);
      expect(visitor).toContain('list "Technology stacks"');
      expect(visitor).toContain('StaticText "React"');
      await expect(runAgentBrowser(visitorSession, 'get', 'attr', 'a[href*="github.com/open-mercato"]', 'href'))
        .resolves.toBe(publicWorkUrl);

      const orm = await MikroORM.init({ clientUrl: databaseUrl, entities });
      await orm.connect();
      try {
        const profile = await orm.em.fork().findOneOrFail(MentorProfile, { id: fixture.profileId });
        expect(profile.publishedAt).not.toBeNull();
        expect(profile.slug).toBe(new URL(shareUrl).pathname.replace('/m/', ''));
        expect(profile.publicWorkUrl).toBe(publicWorkUrl);
        expect(profile.bio).toBe(bio);
        expect(profile.stackTags).toEqual(['React']);
      } finally {
        await orm.close(true);
      }
    } catch (error) {
      await captureBrowserFailure(mentorSession, 'mentor-profile-save-publish');
      throw error;
    } finally {
      await closeAgentBrowser(mentorSession);
      await closeAgentBrowser(visitorSession);
      await resetPublishedMentorProfile(databaseUrl);
    }
  });
});

describe('TC-MENTOR-PROFILE-003 technologies outside the approved four', () => {
  it('refuses an unknown technology, keeps the stored ones and offers only the four approved options', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const databaseUrl = inject('integrationDatabaseUrl');
    const session = `devmentor-profile-tags-${process.pid}`;

    try {
      const mentor = await seedPublishedMentorProfile(databaseUrl);
      const cookie = await signInCookieHeader(baseUrl, 'mock-mentor');

      const response = await fetch(`${baseUrl}/api/mentors/me`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json', 'x-devmentor-request': '1', cookie },
        body: JSON.stringify({ stackTags: ['TypeScript', 'Go'] }),
      });
      expect(response.status).toBe(422);
      expect(await response.json()).toEqual({
        ok: false,
        error: {
          code: 'validation_failed',
          message: 'Validation failed',
          fieldErrors: {
            'stackTags.1': ['Invalid option: expected one of "TypeScript"|"React"|"Python"|"AI agents"'],
          },
        },
      });

      const orm = await MikroORM.init({ clientUrl: databaseUrl, entities });
      await orm.connect();
      try {
        const profile = await orm.em.fork().findOneOrFail(MentorProfile, { id: mentor.profileId });
        expect(profile.stackTags).toEqual(['TypeScript', 'AI agents']);
      } finally {
        await orm.close(true);
      }

      await signInAs(session, baseUrl, 'mock-mentor');
      await runAgentBrowser(session, 'open', `${baseUrl}/mentor/profile`);
      await runAgentBrowser(session, 'wait', '--text', 'Ready to publish?');
      const snapshot = await runAgentBrowser(session, 'snapshot');
      const offered = [...snapshot.matchAll(/checkbox "([^"]+)"/g)].map(([, name]) => name);
      expect(offered).toEqual(['TypeScript', 'React', 'Python', 'AI agents']);
    } catch (error) {
      await captureBrowserFailure(session, 'mentor-profile-unknown-tag');
      throw error;
    } finally {
      await closeAgentBrowser(session);
      await resetPublishedMentorProfile(databaseUrl);
    }
  });
});
