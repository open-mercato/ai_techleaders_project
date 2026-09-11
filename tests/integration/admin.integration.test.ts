import { resolve } from 'node:path';
import { describe, expect, inject, it } from 'vitest';
import {
  captureBrowserFailure,
  closeAgentBrowser,
  integrationArtifactsDirectory,
  runAgentBrowser,
  signInAs,
} from './agent-browser';

describe('TC-ADMIN-001 admin panel basics', () => {
  it('shows a connected dashboard and the seeded users table', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const session = inject('adminBrowserSession');

    try {
      // `/admin` and `/admin/users` are operator-only now, so this scenario signs in
      // first. Anonymously it would be redirected to `/sign-in` and every assertion
      // below would fail on a screen that is working exactly as intended.
      await signInAs(session, baseUrl, 'mock-operator');
      await runAgentBrowser(session, 'open', `${baseUrl}/admin`);
      await runAgentBrowser(session, 'wait', '--text', 'Connected');
      const dashboard = await runAgentBrowser(session, 'snapshot');

      expect(dashboard).toContain('heading "Dashboard"');
      expect(dashboard).toContain('StaticText "Connected"');
      expect(dashboard).toContain('link "Users"');

      await runAgentBrowser(
        session,
        'screenshot',
        resolve(integrationArtifactsDirectory, 'admin-dashboard.png'),
        '--full',
      );

      await runAgentBrowser(session, 'open', `${baseUrl}/admin/users`);
      await runAgentBrowser(session, 'wait', '--text', 'Ada Lovelace');
      const users = await runAgentBrowser(session, 'snapshot');

      expect(users).toContain('heading "Users"');
      expect(users).toContain('cell "Ada Lovelace"');
      expect(users).toContain('cell "ada@devmentor.dev"');
      expect(users).toContain('cell "Systems & algorithms mentor"');

      await runAgentBrowser(
        session,
        'screenshot',
        resolve(integrationArtifactsDirectory, 'admin-users.png'),
        '--full',
      );
    } catch (error) {
      await captureBrowserFailure(session, 'admin');
      throw error;
    } finally {
      await closeAgentBrowser(session);
    }
  });
});
