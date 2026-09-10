import { resolve } from 'node:path';
import { describe, expect, inject, it } from 'vitest';
import { SESSION_COOKIE_NAME } from '@devmentor/core';
import {
  captureBrowserFailure,
  closeAgentBrowser,
  integrationArtifactsDirectory,
  runAgentBrowser,
  signInAs,
  signInCookieHeader,
} from './agent-browser';

/**
 * GitHub sign-in, end to end, in a real browser against a real database.
 *
 * Every scenario starts at `/api/auth/github` — the route the button links to — so what is
 * exercised is the whole flow: state minting, the state cookie, the callback's equality
 * check, `findOrCreateFromGithub`, the session cookie and `homeFor`. Only the identity
 * provider is faked, and only through the container (`AUTH_IDENTITY_ADAPTER=mock` plus
 * `INTEGRATION_TEST_RUN=1`), so no route here contains a test branch.
 *
 * The three personas are seeded: `mock-mentee`, `mock-mentor` and `mock-operator` exist at
 * `<login>@devmentor.test` with a verified address, so a first sign-in links the GitHub id
 * onto the existing row. Ada is deliberately unreachable — no login produces
 * `ada@devmentor.dev` — which is why the mentor scenario uses `mock-mentor`.
 *
 * Each scenario owns an isolated browser session, so a tampered cookie in one cannot leak
 * into another, and closes it in `finally`.
 */

/** A session name nothing else in the suite can collide with. */
function browserSession(scenario: string): string {
  return `devmentor-auth-${scenario}-${process.pid}`;
}

/** The path a landing URL points at, so an assertion never depends on the host or port. */
function pathOf(url: string): string {
  return new URL(url).pathname;
}

async function usersVisibleToOperator(baseUrl: string): Promise<number> {
  const cookie = await signInCookieHeader(baseUrl, 'mock-operator');
  const response = await fetch(`${baseUrl}/api/users`, { headers: { cookie } });
  const payload = (await response.json()) as { ok: boolean; data?: unknown[] };

  expect(response.status).toBe(200);
  expect(payload.ok).toBe(true);
  return (payload.data ?? []).length;
}

describe('TC-AUTH-001 a cancelled GitHub authorisation', () => {
  it('says no account was created, and creates none', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const session = browserSession('cancelled');

    try {
      const before = await usersVisibleToOperator(baseUrl);

      // What GitHub sends back when the user presses Cancel on the consent screen.
      await runAgentBrowser(
        session,
        'open',
        `${baseUrl}/api/auth/github/callback?error=access_denied`,
      );
      const url = await runAgentBrowser(session, 'get', 'url');
      const snapshot = await runAgentBrowser(session, 'snapshot');

      expect(pathOf(url)).toBe('/sign-in');
      expect(new URL(url).searchParams.get('cancelled')).toBe('1');
      // The notice is an alert, and it says the thing that did not happen (edge case 2).
      expect(snapshot).toContain('alert');
      expect(snapshot).toContain('Sign-in was cancelled');
      expect(snapshot).toContain('no account was created');
      // GitHub first, email second and disabled until Slice 4.
      expect(snapshot).toContain('link "Continue with GitHub"');
      expect(snapshot).toContain('Email sign-in is not available yet');

      await runAgentBrowser(
        session,
        'screenshot',
        resolve(integrationArtifactsDirectory, 'auth-sign-in-cancelled.png'),
        '--full',
      );

      expect(await usersVisibleToOperator(baseUrl)).toBe(before);
    } catch (error) {
      await captureBrowserFailure(session, 'auth-cancelled');
      throw error;
    } finally {
      await closeAgentBrowser(session);
    }
  });
});

describe('TC-AUTH-002 a signed-in persona lands on their own home', () => {
  it('sends a mentee to /home', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const session = browserSession('mentee');

    try {
      const landing = await signInAs(session, baseUrl, 'mock-mentee');
      const snapshot = await runAgentBrowser(session, 'snapshot');

      expect(pathOf(landing)).toBe('/home');
      expect(snapshot).toContain('heading "My sessions"');
      expect(snapshot).toContain('button "Sign out"');

      await runAgentBrowser(
        session,
        'screenshot',
        resolve(integrationArtifactsDirectory, 'auth-mentee-home.png'),
        '--full',
      );
    } catch (error) {
      await captureBrowserFailure(session, 'auth-mentee');
      throw error;
    } finally {
      await closeAgentBrowser(session);
    }
  });

  it('sends the seeded mentor to /mentor', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const session = browserSession('mentor');

    try {
      const landing = await signInAs(session, baseUrl, 'mock-mentor');
      const snapshot = await runAgentBrowser(session, 'snapshot');

      expect(pathOf(landing)).toBe('/mentor');
      expect(snapshot).toContain('heading "Mentor workspace"');

      await runAgentBrowser(
        session,
        'screenshot',
        resolve(integrationArtifactsDirectory, 'auth-mentor-home.png'),
        '--full',
      );
    } catch (error) {
      await captureBrowserFailure(session, 'auth-mentor');
      throw error;
    } finally {
      await closeAgentBrowser(session);
    }
  });

  it('sends the operator to /admin, which the allowlist decides live', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const session = browserSession('operator');

    try {
      // The seeded operator also holds `mentor`; `homeFor` prefers `/admin` for the pair.
      const landing = await signInAs(session, baseUrl, 'mock-operator');
      const snapshot = await runAgentBrowser(session, 'snapshot');

      expect(pathOf(landing)).toBe('/admin');
      expect(snapshot).toContain('heading "Dashboard"');
      expect(snapshot).toContain('link "Users"');

      await runAgentBrowser(
        session,
        'screenshot',
        resolve(integrationArtifactsDirectory, 'auth-operator-home.png'),
        '--full',
      );
    } catch (error) {
      await captureBrowserFailure(session, 'auth-operator');
      throw error;
    } finally {
      await closeAgentBrowser(session);
    }
  });
});

describe('TC-AUTH-003 a session that no longer verifies', () => {
  it('redirects a signed-in screen back to sign-in and reveals nothing', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const session = browserSession('expired');

    try {
      await signInAs(session, baseUrl, 'mock-mentee');

      // Expired, tampered, signed with a rotated secret, or carrying a stale
      // `session_version` all arrive identically at the guard: `verify` returns null
      // (edge case 10). A value the browser holds but the server will not accept is the
      // reachable form of that from out here.
      await runAgentBrowser(
        session,
        'cookies',
        'set',
        SESSION_COOKIE_NAME,
        'expired.session.value',
        '--url',
        baseUrl,
      );
      await runAgentBrowser(session, 'open', `${baseUrl}/home`);
      const url = await runAgentBrowser(session, 'get', 'url');
      const snapshot = await runAgentBrowser(session, 'snapshot');

      expect(pathOf(url)).toBe('/sign-in');
      expect(new URL(url).searchParams.get('returnTo')).toBe('/home');
      // Nothing of the user's rendered first (#12): not the heading, not the sign-out.
      expect(snapshot).not.toContain('My sessions');
      expect(snapshot).not.toContain('button "Sign out"');
      expect(snapshot).toContain('heading "Welcome back"');

      await runAgentBrowser(
        session,
        'screenshot',
        resolve(integrationArtifactsDirectory, 'auth-expired-session.png'),
        '--full',
      );
    } catch (error) {
      await captureBrowserFailure(session, 'auth-expired');
      throw error;
    } finally {
      await closeAgentBrowser(session);
    }
  });
});
