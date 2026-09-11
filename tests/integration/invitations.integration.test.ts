import { resolve } from 'node:path';
import { describe, expect, inject, it } from 'vitest';
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
  deleteInvitationScenario,
  readInviteeState,
  seedInvitation,
  setEmailVerifiedAt,
} from './fixtures/invitation';
import { resetInvitationInvitee, seedPendingInvitation } from './fixtures/mentor';

const CSRF_HEADERS = {
  'content-type': 'application/json',
  'x-devmentor-request': '1',
};
const WRONG_ACCOUNT_MESSAGE = 'Sign in with the verified email address this invitation was sent to.';
const INVALID_INVITATION_MESSAGE = 'This invitation is not valid.';
const DAY_MS = 24 * 60 * 60 * 1000;

function browserSession(scenario: string): string {
  return `devmentor-invitations-${scenario}-${process.pid}`;
}

/** A mock GitHub login unique to this run; its account is `<login>@devmentor.test`. */
function scenarioLogin(scenario: string): string {
  return `invite-${scenario}-${process.pid}`;
}

function emailFor(login: string): string {
  return `${login}@devmentor.test`;
}

async function acceptInvitation(baseUrl: string, token: string, cookie: string) {
  return fetch(`${baseUrl}/api/invitations/${token}/accept`, {
    method: 'POST',
    headers: { ...CSRF_HEADERS, cookie },
  });
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

describe('TC-INVITE-003 signed in with a different account', () => {
  it('shows the invited address instead of an accept button and refuses the accept request', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const databaseUrl = inject('integrationDatabaseUrl');
    const session = browserSession('wrong-account');
    const invitedEmail = emailFor(scenarioLogin('owner'));
    const viewerLogin = scenarioLogin('other');
    const viewerEmail = emailFor(viewerLogin);

    try {
      const invitation = await seedInvitation(databaseUrl, { email: invitedEmail });

      await signInAs(session, baseUrl, viewerLogin);
      await runAgentBrowser(session, 'open', `${baseUrl}/invitation/${invitation.token}`);
      const snapshot = await runAgentBrowser(session, 'snapshot');
      expect(snapshot).toContain('heading "Use the invited account"');
      expect(snapshot).toContain(
        `This invitation was sent to ${invitedEmail}. You are signed in as ${viewerEmail}. ` +
          `Sign out, then sign in with ${invitedEmail} to accept it.`,
      );
      expect(snapshot).toContain('button "Sign out"');
      expectAbsent(
        snapshot,
        { role: 'button', text: 'Accept invitation' },
        {
          tree: 'the invitation page for a different signed-in account',
          provenBy: [{ role: 'heading', text: 'Use the invited account' }],
        },
      );
      await runAgentBrowser(
        session,
        'screenshot',
        resolve(integrationArtifactsDirectory, 'invitation-wrong-account.png'),
        '--full',
      );

      const cookie = await signInCookieHeader(baseUrl, viewerLogin);
      const response = await acceptInvitation(baseUrl, invitation.token, cookie);
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        ok: false,
        error: { code: 'forbidden', message: WRONG_ACCOUNT_MESSAGE },
      });

      expect(await readInviteeState(databaseUrl, invitation.id, viewerEmail)).toEqual({
        acceptedAt: null,
        roles: ['mentee'],
        hasMentorProfile: false,
      });
    } catch (error) {
      await captureBrowserFailure(session, 'invitation-wrong-account');
      throw error;
    } finally {
      await closeAgentBrowser(session);
      await deleteInvitationScenario(databaseUrl, [invitedEmail, viewerEmail]);
    }
  });
});

describe('TC-INVITE-004 expired and revoked invitation links', () => {
  it.each([
    { state: 'expired', seed: () => ({ expiresAt: new Date(Date.now() - DAY_MS) }) },
    { state: 'revoked', seed: () => ({ revokedAt: new Date() }) },
  ])('treats a link that is $state as not valid even for the invited account', async ({ state, seed }) => {
    const baseUrl = inject('integrationBaseUrl');
    const databaseUrl = inject('integrationDatabaseUrl');
    const session = browserSession(state);
    const login = scenarioLogin(state);
    const email = emailFor(login);

    try {
      const invitation = await seedInvitation(databaseUrl, { email, ...seed() });

      await signInAs(session, baseUrl, login);
      await runAgentBrowser(session, 'open', `${baseUrl}/invitation/${invitation.token}`);
      await expect(runAgentBrowser(session, 'get', 'text', '[role="alert"]'))
        .resolves.toBe(INVALID_INVITATION_MESSAGE);
      expectAbsent(
        await runAgentBrowser(session, 'snapshot'),
        { role: 'button', text: 'Accept invitation' },
        {
          tree: `the ${state} invitation page`,
          provenBy: [{ text: INVALID_INVITATION_MESSAGE }],
        },
      );
      await runAgentBrowser(
        session,
        'screenshot',
        resolve(integrationArtifactsDirectory, `invitation-${state}.png`),
        '--full',
      );

      const cookie = await signInCookieHeader(baseUrl, login);
      const response = await acceptInvitation(baseUrl, invitation.token, cookie);
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({
        ok: false,
        error: { code: 'not_found', message: INVALID_INVITATION_MESSAGE },
      });

      expect(await readInviteeState(databaseUrl, invitation.id, email)).toEqual({
        acceptedAt: null,
        roles: ['mentee'],
        hasMentorProfile: false,
      });
    } catch (error) {
      await captureBrowserFailure(session, `invitation-${state}`);
      throw error;
    } finally {
      await closeAgentBrowser(session);
      await deleteInvitationScenario(databaseUrl, [email]);
    }
  });
});

describe('TC-INVITE-005 two accepts of one invitation at the same time', () => {
  it('grants the mentor role once and refuses the second request', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const databaseUrl = inject('integrationDatabaseUrl');
    const login = scenarioLogin('race');
    const email = emailFor(login);

    try {
      const cookie = await signInCookieHeader(baseUrl, login);
      const invitation = await seedInvitation(databaseUrl, { email });

      const responses = await Promise.all([
        acceptInvitation(baseUrl, invitation.token, cookie),
        acceptInvitation(baseUrl, invitation.token, cookie),
      ]);
      const outcomes = await Promise.all(
        responses.map(async (response) => ({
          status: response.status,
          body: (await response.json()) as { ok: boolean; error?: { code: string } },
        })),
      );
      const accepted = outcomes.filter(({ status }) => status === 200);
      const refused = outcomes.filter(({ status }) => status !== 200);
      expect(accepted).toHaveLength(1);
      expect(accepted[0]?.body).toMatchObject({ ok: true, data: { roles: ['mentee', 'mentor'] } });
      expect(refused).toHaveLength(1);
      // The loser either finds the invitation already accepted (404) or, if its session
      // check runs after the winner's commit, a stale session (401). A 500 or 409 would
      // mean the lock let both requests reach the write.
      expect([
        { status: 404, code: 'not_found' },
        { status: 401, code: 'unauthorized' },
      ]).toContainEqual({ status: refused[0]?.status, code: refused[0]?.body.error?.code });
      expect(refused[0]?.body.ok).toBe(false);

      const state = await readInviteeState(databaseUrl, invitation.id, email);
      expect(state.acceptedAt).toBeInstanceOf(Date);
      expect(state.roles).toEqual(['mentee', 'mentor']);
      expect(state.hasMentorProfile).toBe(true);
    } finally {
      await deleteInvitationScenario(databaseUrl, [email]);
    }
  });
});

describe('TC-INVITE-006 an invited account whose email is not verified', () => {
  it('is refused the same way as a different account and gains nothing', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const databaseUrl = inject('integrationDatabaseUrl');
    const session = browserSession('unverified');
    const login = scenarioLogin('unverified');
    const email = emailFor(login);

    try {
      const cookie = await signInCookieHeader(baseUrl, login);
      const invitation = await seedInvitation(databaseUrl, { email });
      await setEmailVerifiedAt(databaseUrl, email, null);

      await signInAs(session, baseUrl, login);
      await runAgentBrowser(session, 'open', `${baseUrl}/invitation/${invitation.token}`);
      const snapshot = await runAgentBrowser(session, 'snapshot');
      expect(snapshot).toContain('heading "Use the invited account"');
      expect(snapshot).toContain('button "Sign out"');
      expectAbsent(
        snapshot,
        { role: 'button', text: 'Accept invitation' },
        {
          tree: 'the invitation page for an unverified invited account',
          provenBy: [{ role: 'heading', text: 'Use the invited account' }],
        },
      );

      const response = await acceptInvitation(baseUrl, invitation.token, cookie);
      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({
        ok: false,
        error: { code: 'forbidden', message: WRONG_ACCOUNT_MESSAGE },
      });

      expect(await readInviteeState(databaseUrl, invitation.id, email)).toEqual({
        acceptedAt: null,
        roles: ['mentee'],
        hasMentorProfile: false,
      });
    } catch (error) {
      await captureBrowserFailure(session, 'invitation-unverified');
      throw error;
    } finally {
      await closeAgentBrowser(session);
      await deleteInvitationScenario(databaseUrl, [email]);
    }
  });
});
