import { resolve } from 'node:path';
import { describe, expect, inject, it } from 'vitest';
import { INVALID_CREDENTIALS_MESSAGE, SESSION_COOKIE_NAME } from '@devmentor/core';
import { SEED_PASSWORD } from '@devmentor/db';
import { waitForMail } from './mail';
import {
  captureBrowserFailure,
  closeAgentBrowser,
  integrationArtifactsDirectory,
  runAgentBrowser,
  signInAs,
  signInCookieHeader,
} from './agent-browser';

/**
 * Sign-in, end to end, in a real browser against a real database — both methods.
 *
 * TC-AUTH-001 to 003 start at `/api/auth/github` — the route the button links to — so what is
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
 * TC-AUTH-004 and 005 (Slice 4) drive the **email** half through the rendered form instead:
 * a wrong password, the seeded password, and a registration followed all the way to the link
 * `waitForMail` captures from the log mailer. Nothing there asks the app for a token, so a
 * registration whose mail was never delivered fails the scenario rather than passing it — the
 * fail-closed behaviour of edge case 29 is what the wait is measuring.
 *
 * Each scenario owns an isolated browser session, so a tampered cookie in one cannot leak
 * into another, and closes it in `finally`.
 */

/** The seeded persona whose password this suite signs in with. */
const MENTEE_EMAIL = 'mock-mentee@devmentor.test';

/**
 * The password TC-AUTH-005 registers with. Long enough for `registerSchema`'s 12-character
 * minimum, and obviously fake for the same reason `SEED_PASSWORD` is.
 */
const REGISTERED_PASSWORD = 'integration-password-not-a-secret';

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
      // GitHub first, email second — and from Slice 4 the email half is live, so what
      // proves the order is the form's own controls rather than a disabled note.
      expect(snapshot).toContain('link "Continue with GitHub"');
      expect(snapshot).toContain('button "Sign in"');
      expect(snapshot).not.toContain('Email sign-in is not available yet');

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

describe('TC-AUTH-004 signing in with an email address and a password', () => {
  it('lets a seeded persona in through the form, and refuses a wrong password generically', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const session = browserSession('password');

    try {
      await runAgentBrowser(session, 'open', `${baseUrl}/sign-in`);
      await runAgentBrowser(session, 'wait', '--text', 'Sign in with email');

      // The wrong password first, in the same browser session, so the assertion that no
      // cookie was stored is about a jar that was genuinely empty rather than one that had
      // been cleared. `find label` and `find role` keep the queries semantic (AGENTS.md).
      await runAgentBrowser(session, 'find', 'label', 'Email address', 'fill', MENTEE_EMAIL);
      await runAgentBrowser(session, 'find', 'label', 'Password', 'fill', 'not-the-password');
      await runAgentBrowser(session, 'find', 'role', 'button', 'click', '--name', 'Sign in');
      await runAgentBrowser(session, 'wait', '--text', INVALID_CREDENTIALS_MESSAGE);

      const refused = await runAgentBrowser(session, 'snapshot');
      const refusedJar = await runAgentBrowser(session, 'cookies');

      // Edge case 13: one message for a wrong password and for an address with no account,
      // and — the half a screenshot cannot show — no session.
      expect(refused).toContain(INVALID_CREDENTIALS_MESSAGE);
      expect(refusedJar).not.toContain(SESSION_COOKIE_NAME);
      expect(pathOf(await runAgentBrowser(session, 'get', 'url'))).toBe('/sign-in');

      await runAgentBrowser(
        session,
        'screenshot',
        resolve(integrationArtifactsDirectory, 'auth-password-refused.png'),
        '--full',
      );

      // Then the real one, which must land exactly where GitHub sign-in lands: the two
      // methods share one session mechanism, and `homeFor` is the one place that decides.
      await runAgentBrowser(session, 'find', 'label', 'Password', 'fill', SEED_PASSWORD);
      await runAgentBrowser(session, 'find', 'role', 'button', 'click', '--name', 'Sign in');
      await runAgentBrowser(session, 'wait', '--text', 'My sessions');

      const home = await runAgentBrowser(session, 'snapshot');

      expect(pathOf(await runAgentBrowser(session, 'get', 'url'))).toBe('/home');
      expect(home).toContain('heading "My sessions"');
      expect(home).toContain('button "Sign out"');
      expect(await runAgentBrowser(session, 'cookies')).toContain(SESSION_COOKIE_NAME);

      await runAgentBrowser(
        session,
        'screenshot',
        resolve(integrationArtifactsDirectory, 'auth-password-home.png'),
        '--full',
      );
    } catch (error) {
      await captureBrowserFailure(session, 'auth-password');
      throw error;
    } finally {
      await closeAgentBrowser(session);
    }
  });
});

describe('TC-AUTH-005 registering with an email address', () => {
  it('completes end to end by opening the link the mailer actually sent', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const session = browserSession('register');
    // Unique per run, so re-running the suite against a fresh container or the same one
    // never collides with a row this scenario left behind (`registerWithPassword` would
    // answer 409, which is a different test).
    const email = `registered-${process.pid}-${Date.now()}@devmentor.test`;

    try {
      await runAgentBrowser(session, 'open', `${baseUrl}/register`);
      await runAgentBrowser(session, 'wait', '--text', 'Create an account with email');

      await runAgentBrowser(session, 'find', 'label', 'Display name', 'fill', 'Registered Person');
      await runAgentBrowser(session, 'find', 'label', 'Email address', 'fill', email);
      await runAgentBrowser(session, 'find', 'label', 'Password', 'fill', REGISTERED_PASSWORD);
      await runAgentBrowser(session, 'find', 'role', 'button', 'click', '--name', 'Create account');
      await runAgentBrowser(session, 'wait', '--text', 'open the link');

      const confirmation = await runAgentBrowser(session, 'snapshot');

      // Registration signs nobody in: `email_verified_at` gates sign-in, so the screen says
      // what to do next and the jar is still empty.
      expect(confirmation).toContain(email);
      expect(await runAgentBrowser(session, 'cookies')).not.toContain(SESSION_COOKIE_NAME);

      await runAgentBrowser(
        session,
        'screenshot',
        resolve(integrationArtifactsDirectory, 'auth-register-sent.png'),
        '--full',
      );

      // Sign-in is refused until the address is confirmed (edge case 15), which is what
      // makes the link — rather than the registration — the thing that creates access.
      const early = await fetch(`${baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-devmentor-request': '1' },
        body: JSON.stringify({ email, password: REGISTERED_PASSWORD }),
      });
      expect(early.status).toBe(401);
      expect(early.headers.getSetCookie()).toEqual([]);

      // The real message, captured from the log mailer the harness selected. Nothing here
      // asks the app for the token: if delivery had failed, registration would have failed
      // too (edge case 29), and this wait is what would notice.
      const mail = await waitForMail(email);
      const link = mail.text.match(/https?:\/\/\S+/)?.[0];

      expect(mail.subject).toContain('Confirm your email address');
      expect(link).toBeDefined();
      // The token is a bearer credential in an inbox: it must carry no credential material.
      expect(mail.text).not.toContain(REGISTERED_PASSWORD);

      await runAgentBrowser(session, 'open', link as string);
      await runAgentBrowser(session, 'wait', '--text', 'My sessions');

      const signedIn = await runAgentBrowser(session, 'snapshot');

      // Opening the link both confirms the address and signs the browser in, on one
      // response — a redirect that carries `Set-Cookie`.
      expect(pathOf(await runAgentBrowser(session, 'get', 'url'))).toBe('/home');
      expect(signedIn).toContain('heading "My sessions"');
      expect(await runAgentBrowser(session, 'cookies')).toContain(SESSION_COOKIE_NAME);

      await runAgentBrowser(
        session,
        'screenshot',
        resolve(integrationArtifactsDirectory, 'auth-register-verified.png'),
        '--full',
      );

      // Edge case 16: a mail scanner that prefetched the link must not have consumed it, so
      // opening it a second time is idempotent and still signs in rather than refusing. The
      // jar is cleared first, so what the second open proves is that the link re-issued a
      // session and not that the first one was still in the browser.
      await runAgentBrowser(session, 'cookies', 'clear');
      await runAgentBrowser(session, 'open', link as string);
      await runAgentBrowser(session, 'wait', '--text', 'My sessions');

      expect(pathOf(await runAgentBrowser(session, 'get', 'url'))).toBe('/home');
    } catch (error) {
      await captureBrowserFailure(session, 'auth-register');
      throw error;
    } finally {
      await closeAgentBrowser(session);
    }
  });
});
