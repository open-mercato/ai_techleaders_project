import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorMessage } from '@devmentor/ui/backend';
import { elements, text } from '../../../test/element-tree';

/**
 * `/sign-in` invoked directly, per AGENTS.md: the page is an async function returning a
 * tree, so the test calls it and asserts on what came back.
 *
 * The one mocking seam is `lib/session`, because the redirect branch **throws** — that is
 * how "nothing of the user's renders first" is true — and a throw yields no tree. The
 * authorized branch (a signed-out visitor, who is the one this page is for) returns
 * normally; the signed-in branch is asserted as the sentinel.
 */

class RedirectSentinel extends Error {}

const session = vi.hoisted(() => ({ redirectIfSignedIn: vi.fn() }));
vi.mock('../../../lib/session', () => ({ redirectIfSignedIn: session.redirectIfSignedIn }));

const { default: SignInPage } = await import('./page');

/** Invoke the page the way the framework does: `searchParams` is a promise. */
function render(params: Record<string, string | string[] | undefined> = {}) {
  return SignInPage({ searchParams: Promise.resolve(params) });
}

/** The notice this render shows, or `undefined` when it shows none. */
async function notice(
  params: Record<string, string | string[] | undefined>,
): Promise<string | undefined> {
  const tree = await render(params);
  const alerts = elements(tree).filter((element) => element.type === ErrorMessage);
  expect(alerts.length).toBeLessThanOrEqual(1);
  return (alerts[0]?.props as { message: string } | undefined)?.message;
}

/** The provider link's destination. */
async function githubHref(
  params: Record<string, string | string[] | undefined> = {},
): Promise<string> {
  const tree = await render(params);
  const links = elements(tree).filter(
    (element) => element.type === 'a' && typeof (element.props as { href?: string }).href === 'string',
  );
  expect(links).toHaveLength(1);
  return (links[0]?.props as { href: string }).href;
}

beforeEach(() => {
  vi.clearAllMocks();
  session.redirectIfSignedIn.mockResolvedValue(undefined);
});

describe('sign-in page', () => {
  it('checks for an existing session before rendering anything', async () => {
    session.redirectIfSignedIn.mockRejectedValue(new RedirectSentinel('NEXT_REDIRECT'));

    await expect(render()).rejects.toBeInstanceOf(RedirectSentinel);
  });

  it('puts the GitHub action before the email fields, and disables the email half', async () => {
    const tree = await render();
    const copy = text(tree);

    // Order in the DOM, not only on screen: D07 makes GitHub the primary method.
    expect(copy.indexOf('Continue with GitHub')).toBeGreaterThanOrEqual(0);
    expect(copy.indexOf('Continue with GitHub')).toBeLessThan(copy.indexOf('Email address'));

    const fieldsets = elements(tree).filter((element) => element.type === 'fieldset');
    expect(fieldsets).toHaveLength(1);
    expect((fieldsets[0]?.props as { disabled: boolean }).disabled).toBe(true);
    expect(copy).toContain('Email sign-in is not available yet');
  });

  it('labels both email fields', async () => {
    const tree = await render();
    const labelled = elements(tree)
      .filter((element) => typeof (element.props as { htmlFor?: string }).htmlFor === 'string')
      .map((element) => (element.props as { htmlFor: string }).htmlFor);
    const inputs = elements(tree)
      .filter((element) => typeof (element.props as { autoComplete?: string }).autoComplete === 'string')
      .map((element) => (element.props as { id: string }).id);

    expect(labelled).toEqual(inputs);
    expect(labelled).toEqual(['sign-in-email', 'sign-in-password']);
  });

  it('shows no notice on a first visit', async () => {
    await expect(notice({})).resolves.toBeUndefined();
  });

  it('says a cancelled sign-in created no account', async () => {
    await expect(notice({ cancelled: '1' })).resolves.toContain('no account was created');
  });

  it('prefers the cancellation over an error code', async () => {
    await expect(notice({ cancelled: '1', error: 'state' })).resolves.toContain(
      'Sign-in was cancelled',
    );
  });

  // Every member of `SignInErrorCode` renders, which is the point of keying the copy table
  // by the exported union: a sixth code cannot be added without a message for it.
  it.each([
    ['state', 'could not be verified'],
    ['unavailable', 'not available right now'],
    ['verification', 'verification link'],
    ['email', 'email address'],
  ])('explains ?error=%s', async (code, expected) => {
    await expect(notice({ error: code })).resolves.toContain(expected);
  });

  it('covers both remedies for an email refusal without echoing a server message', async () => {
    const message = await notice({ error: 'email' });

    expect(message).toContain('GitHub email settings');
    expect(message).toContain('DevMentor registration');
  });

  it('ignores an unknown or repeated error code', async () => {
    await expect(notice({ error: 'teapot' })).resolves.toBeUndefined();
    await expect(notice({ error: ['state', 'email'] })).resolves.toContain(
      'could not be verified',
    );
  });

  it('starts the OAuth flow at the route handler, with no returnTo by default', async () => {
    await expect(githubHref()).resolves.toBe('/api/auth/github');
  });

  it('carries a safe returnTo into the OAuth flow', async () => {
    await expect(githubHref({ returnTo: '/admin/users' })).resolves.toBe(
      '/api/auth/github?returnTo=%2Fadmin%2Fusers',
    );
  });

  it('drops a returnTo the sanitiser rejects', async () => {
    await expect(githubHref({ returnTo: '//evil.example' })).resolves.toBe('/api/auth/github');
    await expect(githubHref({ returnTo: ['/mentor'] })).resolves.toBe(
      '/api/auth/github?returnTo=%2Fmentor',
    );
  });
});
