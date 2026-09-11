import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailAuthForm } from '../../../components/email-auth-form';
import { elements, text } from '../../../test/element-tree';

/**
 * `/register` invoked directly, per AGENTS.md: the page is an async function returning a
 * tree, so the test calls it and asserts on what came back.
 *
 * The one mocking seam is `lib/session`, because the signed-in branch **throws** — that is
 * how "nothing of the user's renders first" is true — and a throw yields no tree. The email
 * form is asserted on as an element with props; what it renders is its own jsdom test's job.
 */

class RedirectSentinel extends Error {}

const session = vi.hoisted(() => ({ redirectIfSignedIn: vi.fn() }));
vi.mock('../../../lib/session', () => ({ redirectIfSignedIn: session.redirectIfSignedIn }));

const { default: RegisterPage } = await import('./page');

type SearchParams = Record<string, string | string[] | undefined>;

function render(params: SearchParams = {}) {
  return RegisterPage({ searchParams: Promise.resolve(params) });
}

/** The props the page handed the email form. */
async function form(params: SearchParams = {}): Promise<Record<string, unknown>> {
  const tree = await render(params);
  const forms = elements(tree).filter((element) => element.type === EmailAuthForm);
  expect(forms).toHaveLength(1);
  return forms[0]?.props as Record<string, unknown>;
}

/**
 * Every `href` in the page's own content, in document order.
 *
 * `AuthLayout`'s `footer` — the "Back to home" link — is a *prop*, and the walk only follows
 * `children`, which is the property that keeps these assertions about the page's decisions
 * rather than the design system's markup.
 */
async function hrefs(params: SearchParams = {}): Promise<string[]> {
  const tree = await render(params);
  return elements(tree)
    .filter((element) => typeof (element.props as { href?: string }).href === 'string')
    .map((element) => (element.props as { href: string }).href);
}

beforeEach(() => {
  vi.clearAllMocks();
  session.redirectIfSignedIn.mockResolvedValue(undefined);
});

describe('register page', () => {
  it('checks for an existing session before rendering anything', async () => {
    // Edge case 28's other half: somebody who already has an account has nothing to do here.
    session.redirectIfSignedIn.mockRejectedValue(new RedirectSentinel('NEXT_REDIRECT'));

    await expect(render()).rejects.toBeInstanceOf(RedirectSentinel);
  });

  it('puts the GitHub action before the email form, as on sign-in', async () => {
    const tree = await render();
    const copy = text(tree);

    // D07 fixes the order on both screens, in the DOM as well as on screen.
    expect(copy.indexOf('Continue with GitHub')).toBeGreaterThanOrEqual(0);
    expect(copy.indexOf('Continue with GitHub')).toBeLessThan(copy.indexOf('or use your email'));
  });

  it('renders the email form in register mode', async () => {
    await expect(form()).resolves.toMatchObject({ mode: 'register', returnTo: '' });
  });

  it('offers a way back to sign-in for somebody who already has an account', async () => {
    await expect(hrefs()).resolves.toEqual(['/api/auth/github', '/sign-in']);
  });

  it('carries a safe returnTo to every destination that needs it', async () => {
    await expect(hrefs({ returnTo: '/mentors/ada' })).resolves.toEqual([
      '/api/auth/github?returnTo=%2Fmentors%2Fada',
      '/sign-in?returnTo=%2Fmentors%2Fada',
    ]);
    await expect(form({ returnTo: '/mentors/ada' })).resolves.toMatchObject({
      returnTo: '/mentors/ada',
    });
  });

  it.each([
    ['//evil.example', 'protocol-relative'],
    ['https://evil.example', 'absolute'],
    ['/api/auth/register', 'a JSON route'],
    ['/_next/static/chunk.js', 'a build asset'],
    ['not-a-path', 'no leading slash'],
  ])('drops %s (%s) rather than putting it in a mailed link', async (returnTo) => {
    // Validated here so a hostile value never reaches the request that builds the link. The
    // server validates it twice more, but this is the first place it could have escaped.
    await expect(form({ returnTo })).resolves.toMatchObject({ returnTo: '' });
    await expect(hrefs({ returnTo })).resolves.toEqual(['/api/auth/github', '/sign-in']);
  });

  it('takes the first value of a repeated returnTo', async () => {
    await expect(form({ returnTo: ['/mentor', '/admin'] })).resolves.toMatchObject({
      returnTo: '/mentor',
    });
  });
});
