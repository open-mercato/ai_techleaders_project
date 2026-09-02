import { resolve } from 'node:path';
import { describe, expect, inject, it } from 'vitest';
import {
  captureBrowserFailure,
  closeAgentBrowser,
  integrationArtifactsDirectory,
  runAgentBrowser,
} from './agent-browser';

describe('TC-HOME-001 public home page', () => {
  it('renders the landing message and primary navigation', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const session = inject('homeBrowserSession');

    try {
      await runAgentBrowser(session, 'open', `${baseUrl}/`);
      await runAgentBrowser(
        session,
        'wait',
        '--text',
        'Grow faster with the right mentor.',
      );
      const snapshot = await runAgentBrowser(session, 'snapshot');

      expect(snapshot).toContain('heading "Grow faster with the right mentor."');
      expect(snapshot).toContain('link "Open the admin dashboard"');
      expect(snapshot).toContain('link "Health check"');

      await runAgentBrowser(
        session,
        'screenshot',
        resolve(integrationArtifactsDirectory, 'home.png'),
        '--full',
      );
    } catch (error) {
      await captureBrowserFailure(session, 'home');
      throw error;
    } finally {
      await closeAgentBrowser(session);
    }
  });
});
