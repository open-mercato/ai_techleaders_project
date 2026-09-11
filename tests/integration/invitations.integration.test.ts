import { resolve } from 'node:path';
import { describe, expect, inject, it } from 'vitest';
import {
  captureBrowserFailure,
  closeAgentBrowser,
  integrationArtifactsDirectory,
  runAgentBrowser,
  signInAs,
} from './agent-browser';
import { expectAbsent } from './assertions';
import { resetInvitationInvitee, seedPendingInvitation } from './fixtures/mentor';

function browserSession(scenario: string): string {
  return `devmentor-invitations-${scenario}-${process.pid}`;
}

describe('TC-INVITE-001 invitation acceptance', () => {
  it('returns from sign-in, accepts once, and stays signed in on the dated mentor home', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const databaseUrl = inject('integrationDatabaseUrl');
    const session = browserSession('accept');
    const seeded = await seedPendingInvitation(
      databaseUrl,
      'mock-mentee@devmentor.test',
      ['TypeScript', 'AI agents'],
    );

    try {
      await runAgentBrowser(session, 'open', `${baseUrl}/invitation/${seeded.token}`);
      let snapshot = await runAgentBrowser(session, 'snapshot');
      expect(snapshot).toContain('heading "Mentor developers through text sessions."');
      expect(snapshot).toContain('link "Sign in with GitHub"');
      expect(snapshot).toContain('mock-mentee@devmentor.test');
      expect(snapshot).toContain('AI agents');

      await runAgentBrowser(session, 'find', 'text', 'Sign in with GitHub', 'click');
      snapshot = await runAgentBrowser(session, 'snapshot');
      expect(new URL(await runAgentBrowser(session, 'get', 'url')).pathname).toBe(
        `/invitation/${seeded.token}`,
      );
      expect(snapshot).toContain('heading "Accept as Mock Mentee"');
      expect(snapshot).toContain('button "Accept invitation"');

      await runAgentBrowser(session, 'find', 'text', 'Accept invitation', 'click');
      await runAgentBrowser(session, 'wait', '--text', 'Publish at least one bookable session by');
      expect(new URL(await runAgentBrowser(session, 'get', 'url')).pathname).toBe('/mentor');
      snapshot = await runAgentBrowser(session, 'snapshot');
      expect(snapshot).toContain('heading "Mentor workspace"');
      expect(snapshot).toContain('Publish at least one bookable session by');
      expect(snapshot).toContain('button "Sign out"');
      expect(snapshot).toContain('link "My sessions"');
      expect(snapshot).toContain('link "Mentor workspace"');

      await runAgentBrowser(
        session,
        'screenshot',
        resolve(integrationArtifactsDirectory, 'invitation-accepted-mentor-home.png'),
        '--full',
      );

      await runAgentBrowser(session, 'open', `${baseUrl}/invitation/${seeded.token}`);
      expect(await runAgentBrowser(session, 'snapshot')).toContain('This invitation is not valid.');
    } catch (error) {
      await captureBrowserFailure(session, 'invitation-accept');
      throw error;
    } finally {
      await closeAgentBrowser(session);
      await resetInvitationInvitee(
        databaseUrl,
        seeded.id,
        'mock-mentee@devmentor.test',
      );
    }
  });
});

describe('TC-INVITE-002 invalid and absent invitation paths', () => {
  it('shows one non-enumerating sentence for an unknown token', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const session = browserSession('unknown');
    try {
      await runAgentBrowser(session, 'open', `${baseUrl}/invitation/unknown-token`);
      const snapshot = await runAgentBrowser(session, 'snapshot');
      expect(snapshot).toContain('This invitation is not valid.');
      expect(snapshot).not.toContain('Accept invitation');
    } finally {
      await closeAgentBrowser(session);
    }
  });

  it('offers a signed-in mentee no open path to become a mentor', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const session = browserSession('no-open-path');
    try {
      await signInAs(session, baseUrl, 'uninvited-mentee');
      const snapshot = await runAgentBrowser(session, 'snapshot');
      expectAbsent(
        snapshot,
        { text: /become a mentor|apply as a mentor|mentor application/i },
        {
          tree: "the mentee's /home",
          provenBy: [
            { role: 'heading', text: 'My sessions' },
            { role: 'button', text: 'Sign out' },
          ],
        },
      );
    } finally {
      await closeAgentBrowser(session);
    }
  });
});
