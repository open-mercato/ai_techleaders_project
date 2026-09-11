import { resolve } from 'node:path';
import { OAUTH_STATE_COOKIE_NAME, SESSION_COOKIE_NAME } from '@devmentor/core';
import { MikroORM, User, entities } from '@devmentor/db';
import { describe, expect, inject, it } from 'vitest';
import {
  captureBrowserFailure,
  closeAgentBrowser,
  integrationArtifactsDirectory,
  runAgentBrowser,
  signInAs,
} from './agent-browser';

const CSRF_HEADERS = {
  'content-type': 'application/json',
  'x-devmentor-request': '1',
};

const STATE_ERROR_MESSAGE =
  'That sign-in request could not be verified, usually because it was left open too long. Start again from this page.';

/** A GitHub login no other scenario or seeded persona uses; the mock derives the account from it. */
function freshLogin(scenario: string): string {
  return `it-${scenario}-${process.pid}`;
}

function emailFor(login: string): string {
  return `${login}@devmentor.test`;
}

function pathAndQuery(url: string, baseUrl: string): string {
  const parsed = new URL(url, baseUrl);
  return `${parsed.pathname}${parsed.search}`;
}

async function withOrm<T>(databaseUrl: string, work: (orm: MikroORM) => Promise<T>): Promise<T> {
  const orm = await MikroORM.init({ clientUrl: databaseUrl, entities });
  await orm.connect();
  try {
    return await work(orm);
  } finally {
    await orm.close(true);
  }
}

async function countUsers(databaseUrl: string, login: string): Promise<number> {
  return withOrm(databaseUrl, (orm) => orm.em.fork().count(User, { email: emailFor(login) }));
}

async function deleteUser(databaseUrl: string, login: string): Promise<void> {
  await withOrm(databaseUrl, (orm) => orm.em.fork().nativeDelete(User, { email: emailFor(login) }));
}

function storeCookies(response: Response, jar: Map<string, string>): void {
  for (const header of response.headers.getSetCookie()) {
    const [pair = ''] = header.split(';');
    const separator = pair.indexOf('=');
    const value = pair.slice(separator + 1);
    if (value === '') jar.delete(pair.slice(0, separator));
    else jar.set(pair.slice(0, separator), value);
  }
}

function cookieHeader(jar: Map<string, string>): string {
  return [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
}

/** Run the mock GitHub round trip without a browser and report where the callback sends it. */
async function signInThroughGithub(
  baseUrl: string,
  login: string,
  returnTo?: string,
): Promise<{ status: number; landing: string; cookie: string }> {
  const query = new URLSearchParams({ login });
  if (returnTo !== undefined) query.set('returnTo', returnTo);
  const jar = new Map<string, string>();

  const start = await fetch(`${baseUrl}/api/auth/github?${query}`, { redirect: 'manual' });
  storeCookies(start, jar);
  expect(start.status).toBe(302);
  const authorizeUrl = start.headers.get('location');
  expect(authorizeUrl).not.toBeNull();

  const callback = await fetch(new URL(authorizeUrl as string, baseUrl), {
    redirect: 'manual',
    headers: { cookie: cookieHeader(jar) },
  });
  storeCookies(callback, jar);
  expect(jar.has(SESSION_COOKIE_NAME)).toBe(true);
  return {
    status: callback.status,
    landing: callback.headers.get('location') ?? '',
    cookie: cookieHeader(jar),
  };
}

async function sessionCookieInBrowser(session: string): Promise<string | undefined> {
  const output = JSON.parse(await runAgentBrowser(session, 'cookies', '--json')) as {
    data: { cookies: { name: string; value: string }[] };
  };
  return output.data.cookies.find(({ name }) => name === SESSION_COOKIE_NAME)?.value;
}

async function openHome(baseUrl: string, cookie: string): Promise<Response> {
  return fetch(`${baseUrl}/home`, { redirect: 'manual', headers: { cookie } });
}

describe('TC-AUTH-009 signing out ends the session', () => {
  it('lands on the home page, drops the cookie and refuses a copy of it afterwards', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const databaseUrl = inject('integrationDatabaseUrl');
    const login = freshLogin('sign-out');
    const session = `devmentor-auth-sign-out-${process.pid}`;

    try {
      const landing = await signInAs(session, baseUrl, login);
      expect(new URL(landing).pathname).toBe('/home');
      const value = await sessionCookieInBrowser(session);
      expect(value).toBeDefined();
      const copiedCookie = `${SESSION_COOKIE_NAME}=${value as string}`;
      expect((await openHome(baseUrl, copiedCookie)).status).toBe(200);

      await runAgentBrowser(session, 'find', 'role', 'button', 'click', '--name', 'Sign out');
      await runAgentBrowser(session, 'wait', '--url', `${baseUrl}/`);

      expect(new URL(await runAgentBrowser(session, 'get', 'url')).pathname).toBe('/');
      const snapshot = await runAgentBrowser(session, 'snapshot');
      expect(snapshot).toContain('heading "Grow faster with the right mentor."');
      expect(snapshot).not.toContain('button "Sign out"');
      expect(await sessionCookieInBrowser(session)).toBeUndefined();

      const replayed = await openHome(baseUrl, copiedCookie);
      expect(replayed.status).toBe(307);
      expect(replayed.headers.get('location')).toBe('/sign-in?returnTo=%2Fhome');

      await runAgentBrowser(
        session,
        'screenshot',
        resolve(integrationArtifactsDirectory, 'auth-signed-out-home.png'),
        '--full',
      );
    } catch (error) {
      await captureBrowserFailure(session, 'auth-sign-out');
      throw error;
    } finally {
      await closeAgentBrowser(session);
      await deleteUser(databaseUrl, login);
    }
  });
});

describe('TC-AUTH-010 sign-out API edges', () => {
  it('refuses a sign-out without the CSRF header and leaves the session working', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const databaseUrl = inject('integrationDatabaseUrl');
    const login = freshLogin('logout-csrf');

    try {
      const { cookie } = await signInThroughGithub(baseUrl, login);

      const refused = await fetch(`${baseUrl}/api/auth/logout`, {
        method: 'POST',
        headers: { cookie },
      });
      expect(refused.status).toBe(403);
      expect(await refused.json()).toEqual({
        ok: false,
        error: {
          code: 'forbidden',
          message:
            'This request must carry the x-devmentor-request header. Send it through the app rather than as a plain form submission.',
        },
      });
      expect(refused.headers.getSetCookie()).toEqual([]);

      expect((await openHome(baseUrl, cookie)).status).toBe(200);
    } finally {
      await deleteUser(databaseUrl, login);
    }
  });

  it('signs out a request carrying an unreadable session cookie and expires it', async () => {
    const baseUrl = inject('integrationBaseUrl');

    const response = await fetch(`${baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { ...CSRF_HEADERS, cookie: `${SESSION_COOKIE_NAME}=tampered.session.value` },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, data: null });
    const expired = response.headers
      .getSetCookie()
      .find((cookie) => cookie.startsWith(`${SESSION_COOKIE_NAME}=;`));
    expect(expired).toBeDefined();
    expect(expired).toMatch(/;\s*Max-Age=0/i);
  });
});

describe('TC-AUTH-011 an unsafe returnTo falls back to the role home', () => {
  it('ignores off-site and API destinations but keeps a same-origin page', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const databaseUrl = inject('integrationDatabaseUrl');
    const login = freshLogin('return-to');

    try {
      for (const hostile of ['//evil.example', 'https://evil.example/x', '/api/users']) {
        const { status, landing } = await signInThroughGithub(baseUrl, login, hostile);
        expect(status).toBe(302);
        expect(landing, `returnTo=${hostile}`).toBe('/home');
      }

      const honoured = await signInThroughGithub(baseUrl, login, '/home?from=integration');
      expect(honoured.status).toBe(302);
      expect(pathAndQuery(honoured.landing, baseUrl)).toBe('/home?from=integration');

      expect(await countUsers(databaseUrl, login)).toBe(1);
    } finally {
      await deleteUser(databaseUrl, login);
    }
  });
});

describe('TC-AUTH-012 a signed-in visitor opening sign-in or register', () => {
  it('is sent to their own home instead of the forms', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const databaseUrl = inject('integrationDatabaseUrl');
    const login = freshLogin('signed-in-forms');
    const session = `devmentor-auth-signed-in-forms-${process.pid}`;

    try {
      await signInAs(session, baseUrl, login);

      for (const form of ['/sign-in', '/register']) {
        await runAgentBrowser(session, 'open', `${baseUrl}${form}`);
        await runAgentBrowser(session, 'wait', '--text', 'My sessions');
        expect(new URL(await runAgentBrowser(session, 'get', 'url')).pathname, form).toBe('/home');
        const snapshot = await runAgentBrowser(session, 'snapshot');
        expect(snapshot).toContain('heading "My sessions"');
        expect(snapshot).not.toContain('heading "Welcome back"');
      }

      await runAgentBrowser(
        session,
        'screenshot',
        resolve(integrationArtifactsDirectory, 'auth-signed-in-register-redirect.png'),
        '--full',
      );
    } catch (error) {
      await captureBrowserFailure(session, 'auth-signed-in-forms');
      throw error;
    } finally {
      await closeAgentBrowser(session);
      await deleteUser(databaseUrl, login);
    }
  });
});

describe('TC-AUTH-014 a callback whose state this browser was never given', () => {
  it('lands on sign-in with the state notice and creates no account or session', async () => {
    const baseUrl = inject('integrationBaseUrl');
    const databaseUrl = inject('integrationDatabaseUrl');
    const login = freshLogin('forged-state');
    const callbackUrl = `${baseUrl}/api/auth/github/callback?code=mock-code-${login}&state=forged`;
    const session = `devmentor-auth-forged-state-${process.pid}`;

    try {
      const response = await fetch(callbackUrl, { redirect: 'manual' });
      expect(response.status).toBe(302);
      expect(response.headers.get('location')).toBe('/sign-in?error=state');
      const cookies = response.headers.getSetCookie();
      expect(cookies.some((cookie) => cookie.startsWith(`${OAUTH_STATE_COOKIE_NAME}=;`))).toBe(true);
      expect(cookies.some((cookie) => cookie.startsWith(`${SESSION_COOKIE_NAME}=`))).toBe(false);

      await runAgentBrowser(session, 'open', callbackUrl);
      const url = new URL(await runAgentBrowser(session, 'get', 'url'));
      expect(url.pathname).toBe('/sign-in');
      expect(url.searchParams.get('error')).toBe('state');
      await expect(runAgentBrowser(session, 'get', 'text', '[role="alert"]'))
        .resolves.toBe(STATE_ERROR_MESSAGE);
      const snapshot = await runAgentBrowser(session, 'snapshot');
      expect(snapshot).toContain('heading "Welcome back"');
      expect(snapshot).toContain('link "Continue with GitHub"');
      expect(await sessionCookieInBrowser(session)).toBeUndefined();

      await runAgentBrowser(
        session,
        'screenshot',
        resolve(integrationArtifactsDirectory, 'auth-forged-state.png'),
        '--full',
      );

      expect(await countUsers(databaseUrl, login)).toBe(0);
    } catch (error) {
      await captureBrowserFailure(session, 'auth-forged-state');
      throw error;
    } finally {
      await closeAgentBrowser(session);
      await deleteUser(databaseUrl, login);
    }
  });
});
