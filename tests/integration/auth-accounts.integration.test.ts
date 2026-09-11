import { resolve } from 'node:path';
import { describe, expect, inject, it } from 'vitest';
import {
  INVALID_CREDENTIALS_MESSAGE,
  RATE_LIMITED_MESSAGE,
  SESSION_COOKIE_NAME,
} from '@devmentor/core';
import { SEED_PASSWORD } from '@devmentor/db';
import {
  captureBrowserFailure,
  closeAgentBrowser,
  integrationArtifactsDirectory,
  runAgentBrowser,
  signInAs,
  signInCookieHeader,
} from './agent-browser';
import { deleteAccounts, storedAccounts, throwawayAccount } from './fixtures/accounts';

const JSON_HEADERS = { 'content-type': 'application/json', 'x-devmentor-request': '1' };
const THROWAWAY_PASSWORD = 'integration-password-not-a-secret';

/** Copied from `sign-in/page.tsx` (the `email` code); the page module is not importable here. */
const GITHUB_EMAIL_REFUSAL =
  'DevMentor could not use the email address on that GitHub account. Verify a primary address in your GitHub email settings, and confirm any DevMentor registration for that address, then try again.';

/** Copied from `GITHUB_ACCOUNT_MESSAGE` in `user.service.ts`, which `@devmentor/core` does not export. */
const GITHUB_ACCOUNT_MESSAGE =
  'This email address is already registered through GitHub. Use "Sign in with GitHub" instead of a password.';

interface ErrorEnvelope {
  ok: false;
  error: { code: string; message: string; retryAfterSeconds?: number };
}

function browserSession(scenario: string): string {
  return `devmentor-accounts-${scenario}-${process.pid}`;
}

function pathOf(url: string): string {
  return new URL(url).pathname;
}

async function register(baseUrl: string, email: string, displayName: string): Promise<Response> {
  return fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ email, password: THROWAWAY_PASSWORD, displayName }),
  });
}

async function attemptPasswordSignIn(baseUrl: string, email: string): Promise<Response> {
  return fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: JSON_HEADERS,
    body: JSON.stringify({ email, password: 'not-the-password-for-this-address' }),
  });
}

describe('TC-AUTH-006 a GitHub sign-in whose email matches an unconfirmed registration', () => {
  it('refuses the sign-in, links nothing and creates no second account', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const databaseUrl = inject('integrationDatabaseUrl');
    const session = browserSession('unverified-email');
    const account = throwawayAccount('unverified');

    try {
      const registered = await register(baseUrl, account.email, 'Unconfirmed Person');
      expect(registered.status).toBe(200);

      await runAgentBrowser(session, 'open', `${baseUrl}/api/auth/github?login=${account.login}`);
      await runAgentBrowser(session, 'wait', '--text', GITHUB_EMAIL_REFUSAL);

      const url = await runAgentBrowser(session, 'get', 'url');
      const snapshot = await runAgentBrowser(session, 'snapshot');
      expect(pathOf(url)).toBe('/sign-in');
      expect(new URL(url).searchParams.get('error')).toBe('email');
      expect(snapshot).toContain('heading "Welcome back"');
      expect(await runAgentBrowser(session, 'get', 'text', '[role="alert"]')).toBe(
        GITHUB_EMAIL_REFUSAL,
      );
      expect(await runAgentBrowser(session, 'cookies')).not.toContain(SESSION_COOKIE_NAME);

      await runAgentBrowser(
        session,
        'screenshot',
        resolve(integrationArtifactsDirectory, 'auth-github-unverified-email.png'),
        '--full',
      );

      const rows = await storedAccounts(databaseUrl, account);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        githubId: null,
        hasPassword: true,
        emailVerified: false,
        roles: ['mentee'],
      });
    } catch (error) {
      await captureBrowserFailure(session, 'auth-github-unverified-email');
      throw error;
    } finally {
      await closeAgentBrowser(session);
      await deleteAccounts(databaseUrl, [account.email]);
    }
  });
});

describe('TC-AUTH-007 registering an address that belongs to a GitHub-only account', () => {
  it('answers 409 pointing at GitHub and writes no password', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const databaseUrl = inject('integrationDatabaseUrl');
    const account = throwawayAccount('github-only');

    try {
      await signInCookieHeader(baseUrl, account.login);
      const [before] = await storedAccounts(databaseUrl, account);
      expect(before).toMatchObject({ githubId: account.githubId, hasPassword: false });

      const response = await register(baseUrl, account.email, 'Password Attempt');
      const payload = (await response.json()) as ErrorEnvelope;

      expect(response.status).toBe(409);
      expect(payload).toEqual({
        ok: false,
        error: { code: 'conflict', message: GITHUB_ACCOUNT_MESSAGE },
      });
      expect(response.headers.getSetCookie()).toEqual([]);

      const rows = await storedAccounts(databaseUrl, account);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id: before?.id,
        githubId: account.githubId,
        hasPassword: false,
        emailVerified: true,
      });
    } finally {
      await deleteAccounts(databaseUrl, [account.email]);
    }
  });
});

describe('TC-AUTH-008 a developer signing in with GitHub for the first time', () => {
  it('gets a verified mentee account and lands on /home', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const databaseUrl = inject('integrationDatabaseUrl');
    const session = browserSession('first-github');
    const account = throwawayAccount('first-github');

    try {
      expect(await storedAccounts(databaseUrl, account)).toEqual([]);

      const landing = await signInAs(session, baseUrl, account.login);
      const snapshot = await runAgentBrowser(session, 'snapshot');
      expect(pathOf(landing)).toBe('/home');
      expect(snapshot).toContain('heading "My sessions"');
      expect(snapshot).toContain('button "Sign out"');

      await runAgentBrowser(
        session,
        'screenshot',
        resolve(integrationArtifactsDirectory, 'auth-github-first-sign-in.png'),
        '--full',
      );

      const rows = await storedAccounts(databaseUrl, account);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        githubId: account.githubId,
        hasPassword: false,
        emailVerified: true,
        roles: ['mentee'],
      });
    } catch (error) {
      await captureBrowserFailure(session, 'auth-github-first-sign-in');
      throw error;
    } finally {
      await closeAgentBrowser(session);
      await deleteAccounts(databaseUrl, [account.email]);
    }
  });

  it('creates exactly one account when three first sign-ins arrive at once', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const databaseUrl = inject('integrationDatabaseUrl');
    const account = throwawayAccount('first-github-race');

    try {
      const cookies = await Promise.all([
        signInCookieHeader(baseUrl, account.login),
        signInCookieHeader(baseUrl, account.login),
        signInCookieHeader(baseUrl, account.login),
      ]);

      for (const cookie of cookies) {
        const home = await fetch(`${baseUrl}/home`, { headers: { cookie }, redirect: 'manual' });
        expect(home.status).toBe(200);
      }

      const rows = await storedAccounts(databaseUrl, account);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ githubId: account.githubId, roles: ['mentee'] });
    } finally {
      await deleteAccounts(databaseUrl, [account.email]);
    }
  });
});

describe('TC-AUTH-013 repeated password sign-in attempts for one address', () => {
  it('refuses the sixth attempt with 429 and Retry-After, and only for that address', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const databaseUrl = inject('integrationDatabaseUrl');
    const limited = throwawayAccount('rate-limited').email;
    const unrelated = throwawayAccount('rate-unrelated').email;

    try {
      for (let attempt = 1; attempt <= 5; attempt += 1) {
        const response = await attemptPasswordSignIn(baseUrl, limited);
        expect(response.status, `attempt ${attempt}`).toBe(401);
        expect(((await response.json()) as ErrorEnvelope).error).toEqual({
          code: 'unauthorized',
          message: INVALID_CREDENTIALS_MESSAGE,
        });
      }

      const refused = await attemptPasswordSignIn(baseUrl, limited);
      const payload = (await refused.json()) as ErrorEnvelope;
      const retryAfter = Number(refused.headers.get('retry-after'));

      expect(refused.status).toBe(429);
      expect(payload.error).toMatchObject({ code: 'rate_limited', message: RATE_LIMITED_MESSAGE });
      expect(Number.isInteger(retryAfter)).toBe(true);
      expect(retryAfter).toBeGreaterThanOrEqual(1);
      expect(retryAfter).toBeLessThanOrEqual(900);
      expect(payload.error.retryAfterSeconds).toBe(retryAfter);
      expect(refused.headers.getSetCookie()).toEqual([]);

      const other = await attemptPasswordSignIn(baseUrl, unrelated);
      expect(other.status).toBe(401);
    } finally {
      await deleteAccounts(databaseUrl, [limited, unrelated]);
    }
  });
});

describe('TC-AUTH-015 a password sign-in by the operator, who also holds mentor', () => {
  it('lands on /admin and keeps both the operator and the mentor surface', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const session = browserSession('operator-password');

    try {
      await runAgentBrowser(session, 'open', `${baseUrl}/sign-in`);
      await runAgentBrowser(session, 'wait', '--text', 'Sign in with email');
      await runAgentBrowser(
        session,
        'find',
        'label',
        'Email address',
        'fill',
        'mock-operator@devmentor.test',
      );
      await runAgentBrowser(session, 'find', 'label', 'Password', 'fill', SEED_PASSWORD);
      await runAgentBrowser(session, 'find', 'role', 'button', 'click', '--name', 'Sign in');
      await runAgentBrowser(session, 'wait', '--text', 'Dashboard');

      const dashboard = await runAgentBrowser(session, 'snapshot');
      expect(pathOf(await runAgentBrowser(session, 'get', 'url'))).toBe('/admin');
      expect(dashboard).toContain('heading "Dashboard"');
      expect(dashboard).toContain('link "Users"');
      expect(dashboard).toContain('link "Mentor workspace"');

      await runAgentBrowser(
        session,
        'screenshot',
        resolve(integrationArtifactsDirectory, 'auth-operator-password-admin.png'),
        '--full',
      );

      await runAgentBrowser(session, 'find', 'role', 'link', 'click', '--name', 'Mentor workspace', '--exact');
      await runAgentBrowser(session, 'wait', '--url', '**/mentor');
      const mentor = await runAgentBrowser(session, 'snapshot');
      expect(mentor).toContain('heading "Mentor workspace"');
      expect(mentor).toContain('link "Users"');
    } catch (error) {
      await captureBrowserFailure(session, 'auth-operator-password');
      throw error;
    } finally {
      await closeAgentBrowser(session);
    }
  });
});
