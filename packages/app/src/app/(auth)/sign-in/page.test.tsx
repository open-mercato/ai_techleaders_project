import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorMessage } from '@devmentor/ui/backend';
import { EmailAuthForm } from '../../../components/email-auth-form';
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

/** The provider link's destination. It is the only `<a>`; `/register` is a `<Link>`. */
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

/** The props the page handed the email form. */
async function form(
  params: Record<string, string | string[] | undefined> = {},
): Promise<Record<string, unknown>> {
  const tree = await render(params);
  const forms = elements(tree).filter((element) => element.type === EmailAuthForm);
  expect(forms).toHaveLength(1);
  return forms[0]?.props as Record<string, unknown>;
}

/** Every `href` in the page's own content — the footer is a prop, so it is not walked. */
async function hrefs(
  params: Record<string, string | string[] | undefined> = {},
): Promise<string[]> {
  const tree = await render(params);
  return elements(tree)
    .filter((element) => typeof (element.props as { href?: string }).href === 'string')
    .map((element) => (element.props as { href: string }).href);
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

  it('puts the GitHub action before the email form', async () => {
    const tree = await render();
    const copy = text(tree);

    // Order in the DOM, not only on screen: D07 makes GitHub the primary method, and Slice 4
    // enabling the email half does not change which one a keyboard reaches first.
    expect(copy.indexOf('Continue with GitHub')).toBeGreaterThanOrEqual(0);
    expect(copy.indexOf('Continue with GitHub')).toBeLessThan(copy.indexOf('or use your email'));
  });

  it('renders the live email form, with the note about it being unavailable gone', async () => {
    // The Slice 2 placeholder was a disabled `fieldset` carrying that note; `/api/auth/login`
    // exists now, and this assertion is what fails if the placeholder ever comes back.
    await expect(form()).resolves.toMatchObject({ mode: 'sign-in', returnTo: '' });
    expect(text(await render())).not.toContain('Email sign-in is not available yet');
    expect(elements(await render()).filter((element) => element.type === 'fieldset')).toEqual([]);
  });

  it('offers a way to create an account for somebody who has none', async () => {
    await expect(hrefs()).resolves.toEqual(['/api/auth/github', '/register']);
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

  it('carries the same validated destination to the form and the sign-up link', async () => {
    // One decision, three consumers: whichever route the visitor was bounced off is where
    // GitHub, the password form and a switch to registration all return them to.
    await expect(hrefs({ returnTo: '/admin/users' })).resolves.toEqual([
      '/api/auth/github?returnTo=%2Fadmin%2Fusers',
      '/register?returnTo=%2Fadmin%2Fusers',
    ]);
    await expect(form({ returnTo: '/admin/users' })).resolves.toMatchObject({
      returnTo: '/admin/users',
    });
  });

  it('hands the form no destination at all when the one asked for is hostile', async () => {
    await expect(form({ returnTo: 'https://evil.example' })).resolves.toMatchObject({
      returnTo: '',
    });
    await expect(hrefs({ returnTo: 'https://evil.example' })).resolves.toEqual([
      '/api/auth/github',
      '/register',
    ]);
  });
});
