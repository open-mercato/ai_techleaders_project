import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { SESSION_COOKIE_NAME } from '@devmentor/core';

const execFileAsync = promisify(execFile);
const cliPath = resolve('node_modules/agent-browser/bin/agent-browser.js');

export const integrationArtifactsDirectory = resolve('test-results/integration');

/**
 * A CDP endpoint to attach to instead of launching the bundled Chrome.
 *
 * `agent-browser` ships its own Chrome and launches it, which is right on a machine that
 * can run it. Some cannot: a workstation missing the browser's system libraries, with no
 * `sudo` to install them, cannot start it at all — and the failure is a cryptic
 * `DevToolsActivePort` error rather than anything about libraries. Setting
 * `AGENT_BROWSER_CDP` to a port or ws:// URL points the suite at a Chrome somebody else
 * started, e.g.
 *
 * ```
 * docker run -d --rm --network host chromedp/headless-shell
 * AGENT_BROWSER_CDP=9222 npm run test:integration
 * ```
 *
 * Unset — which is CI, where `test:browser:install:ci` installs the dependencies as root —
 * nothing changes and the bundled Chrome launches as before.
 *
 * **One caveat, handled below.** Named sessions attached to one CDP endpoint share that
 * browser's cookie jar, where a launched session gets its own. A jar carried from a previous
 * scenario file is how `TC-AUTH-004`'s "and no session cookie" assertion starts failing for
 * a reason that has nothing to do with the product, so the first attach for a session clears
 * cookies. Within a file the jar still persists, which is what a scenario switching persona
 * expects.
 */
const cdpEndpoint = process.env.AGENT_BROWSER_CDP;

/** Sessions already attached this process, so the connect happens once per session. */
const connected = new Set<string>();

async function ensureConnected(session: string): Promise<void> {
  if (cdpEndpoint === undefined || connected.has(session)) return;
  connected.add(session);
  const run = (...args: string[]) => execFileAsync(
    process.execPath,
    [cliPath, '--session', session, ...args],
    { cwd: process.cwd(), timeout: 60_000 },
  );
  await run('connect', cdpEndpoint);
  await run('cookies', 'clear');
}

export async function runAgentBrowser(
  session: string,
  ...args: string[]
): Promise<string> {
  if (args[0] !== 'connect') await ensureConnected(session);
  const { stdout } = await execFileAsync(
    process.execPath,
    [cliPath, '--session', session, ...args],
    {
      cwd: process.cwd(),
      maxBuffer: 10 * 1024 * 1024,
      timeout: 60_000,
    },
  );
  return stdout.trim();
}

export async function closeAgentBrowser(session: string): Promise<void> {
  connected.delete(session);
  try {
    await runAgentBrowser(session, 'close');
  } catch {
    // Cleanup is best-effort; the original test/setup failure remains authoritative.
  }
}

export async function captureBrowserFailure(
  session: string,
  artifactPrefix: string,
): Promise<void> {
  await mkdir(integrationArtifactsDirectory, { recursive: true });
  const outputs: string[] = [];

  for (const [label, command] of [
    ['errors', ['errors']],
    ['console', ['console']],
  ] as const) {
    try {
      outputs.push(`${label}:\n${await runAgentBrowser(session, ...command)}`);
    } catch (error) {
      outputs.push(`${label}: unable to collect (${String(error)})`);
    }
  }

  try {
    await runAgentBrowser(
      session,
      'screenshot',
      resolve(integrationArtifactsDirectory, `${artifactPrefix}-failure.png`),
      '--full',
    );
  } catch (error) {
    outputs.push(`screenshot: unable to collect (${String(error)})`);
  }

  await writeFile(
    resolve(integrationArtifactsDirectory, `${artifactPrefix}-diagnostics.txt`),
    `${outputs.join('\n\n')}\n`,
    'utf8',
  );
}

/**
 * Where a mock sign-in starts. It is the *real* start route — the harness never fabricates
 * a session cookie — and `?login` selects which seeded persona comes back, because
 * `MockGithubIdentityAdapter` derives an entire identity from that hint. The adapter is
 * reachable at all only because `tests/integration/environment.ts` sets both
 * `AUTH_IDENTITY_ADAPTER=mock` and `INTEGRATION_TEST_RUN=1`.
 */
function signInUrl(baseUrl: string, login: string): string {
  return `${baseUrl}/api/auth/github?login=${encodeURIComponent(login)}`;
}

/**
 * Sign a browser session in as a seeded persona, and return the URL it landed on.
 *
 * One navigation completes the whole flow: the start route mints the state and redirects to
 * the mock adapter's authorize URL, which is this same app's callback, which sets the session
 * cookie and redirects to `homeFor(roles)`. That works on the harness's ephemeral port
 * because the mock's authorize URL is origin-relative and so never leaves the origin the
 * state cookie was set on — see the `APP_URL` note in `environment.ts`.
 *
 * **The cookie assertion is load-bearing** (edge case 32). The app runs here as production,
 * so its session cookie is `Secure`, and a browser accepts a `Secure` cookie over plain HTTP
 * only because Chrome treats loopback as a trustworthy origin. A harness that ever served
 * from a non-loopback host would silently drop the cookie, and every signed-in scenario would
 * fail somewhere further along — as a redirect back to `/sign-in`, or as a timed-out `wait`.
 * Asserting the jar here fails at the cause instead.
 */
export async function signInAs(
  session: string,
  baseUrl: string,
  login: string,
): Promise<string> {
  await runAgentBrowser(session, 'open', signInUrl(baseUrl, login));

  const jar = await runAgentBrowser(session, 'cookies');
  if (!jar.includes(SESSION_COOKIE_NAME)) {
    throw new Error(
      `Signing in as ${login} stored no ${SESSION_COOKIE_NAME} cookie. The app sets it with ` +
        'Secure, which a browser keeps over plain HTTP only for a trustworthy origin: check ' +
        `that the app is served from loopback. Cookie jar: ${jar || '(empty)'}`,
    );
  }

  return runAgentBrowser(session, 'get', 'url');
}

/**
 * The same sign-in without a browser: returns a `Cookie` header a `fetch` scenario can send.
 *
 * It exists for the assertions that are about JSON rather than about a screen — the seeder
 * idempotency check reads `/api/users`, which is operator-only now — and it is the one place
 * the `Secure` attribute itself is asserted, on the raw `Set-Cookie`. The browser half above
 * can only observe that Chrome *kept* the cookie; this half observes what was sent.
 */
export async function signInCookieHeader(baseUrl: string, login: string): Promise<string> {
  const jar = new Map<string, string>();

  const start = await fetch(signInUrl(baseUrl, login), { redirect: 'manual' });
  const authorizeUrl = start.headers.get('location');
  storeCookies(start, jar);
  if (start.status !== 302 || authorizeUrl === null) {
    throw new Error(`Starting a mock sign-in answered ${start.status} with no redirect.`);
  }

  // `authorizeUrl` is deliberately origin-relative (see the `MockGithubIdentityAdapter`
  // doc comment) so a browser resolves it against whatever origin it is already on.
  // `fetch` has no browsing context to resolve against, so it must be told explicitly.
  const callback = await fetch(new URL(authorizeUrl, baseUrl), {
    redirect: 'manual',
    headers: { cookie: cookieHeader(jar) },
  });
  const issued = callback.headers
    .getSetCookie()
    .find((cookie) => cookie.startsWith(`${SESSION_COOKIE_NAME}=`));
  storeCookies(callback, jar);

  if (issued === undefined) {
    throw new Error(
      `The callback for ${login} issued no session cookie; it redirected to ` +
        `${String(callback.headers.get('location'))}.`,
    );
  }
  // Production is what the harness runs the app as, and `Secure` is what that must produce.
  if (!/;\s*Secure/i.test(issued)) {
    throw new Error(`The session cookie for ${login} was issued without Secure: ${issued}`);
  }

  return cookieHeader(jar);
}

/** Fold a response's `Set-Cookie` headers into the jar, dropping the ones being expired. */
function storeCookies(response: Response, jar: Map<string, string>): void {
  for (const header of response.headers.getSetCookie()) {
    const [pair = ''] = header.split(';');
    const separator = pair.indexOf('=');
    const name = pair.slice(0, separator).trim();
    const value = pair.slice(separator + 1);
    if (value === '') {
      jar.delete(name);
    } else {
      jar.set(name, value);
    }
  }
}

function cookieHeader(jar: Map<string, string>): string {
  return [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
}
