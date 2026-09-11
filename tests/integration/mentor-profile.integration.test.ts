import { resolve } from 'node:path';
import { MentorProfile, MikroORM, entities } from '@devmentor/db';
import { describe, expect, inject, it } from 'vitest';
import {
  captureBrowserFailure,
  closeAgentBrowser,
  integrationArtifactsDirectory,
  runAgentBrowser,
  signInAs,
} from './agent-browser';
import {
  resetPublishedMentorProfile,
  seedMentorProfileMissingStackTags,
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
