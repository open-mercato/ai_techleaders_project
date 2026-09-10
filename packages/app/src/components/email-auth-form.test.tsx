// @vitest-environment jsdom

/**
 * The email half of `/sign-in` and `/register`, under jsdom (AGENTS.md, "Testing React
 * components and pages": Client Components are rendered, Server Components are invoked).
 *
 * `CrudForm`'s own behaviour — validation, pending state, `fieldErrors` placement, focus
 * management — is `CrudForm.test.tsx`'s job and is not repeated here. What is asserted is
 * the configuration only this component decides, and every item on that list is a way to get
 * a credential screen wrong: the field types, the two `autocomplete` values, which endpoint
 * each mode posts to, where a successful sign-in navigates, and that a successful
 * registration says to check the inbox instead of pretending anybody is signed in.
 *
 * **`fetch` is the stub, not `apiCall`.** `CrudForm` reaches `apiCall` through a path inside
 * `packages/ui`, so a mock declared out here would have to name that file across a package
 * boundary — and stubbing the real client would also stop these tests from proving that the
 * CSRF header rides along, which is the one thing standing between this form and a
 * cross-origin POST. `window.location` is replaced rather than spied on: its members are
 * unforgeable, so jsdom refuses to redefine `assign` on the real object.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailAuthForm, type EmailAuthMode } from './email-auth-form';

const request = vi.fn<(path: string, init: RequestInit) => Promise<Response>>();
const assign = vi.fn();

/** An envelope the real `apiCall` will parse, in the shape the routes answer. */
function envelope(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** The `[path, init]` of the single request this render made. */
function sentRequest(): [string, RequestInit] {
  expect(request).toHaveBeenCalledTimes(1);
  return request.mock.calls[0] as [string, RequestInit];
}

/** What was posted, parsed back out of the request body. */
function sentBody(): unknown {
  return JSON.parse(String(sentRequest()[1].body));
}

const MENTEE = {
  id: 'user-1',
  email: 'ada@devmentor.test',
  displayName: 'Ada Lovelace',
  roles: ['mentee'],
  githubLogin: null,
  avatarUrl: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  mentorProfile: null,
};

beforeEach(() => {
  request.mockReset();
  request.mockResolvedValue(envelope({ ok: true, data: MENTEE }));
  assign.mockReset();
  vi.stubGlobal('fetch', request);
  vi.stubGlobal('location', { assign, href: 'http://devmentor.test/sign-in' });
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

function show(mode: EmailAuthMode, returnTo = '') {
  render(<EmailAuthForm mode={mode} returnTo={returnTo} />);
}

function field(label: string): HTMLInputElement {
  return screen.getByLabelText(new RegExp(`^${label}`)) as HTMLInputElement;
}

/** Fill in every field of the current mode and submit. */
async function submit(mode: EmailAuthMode, password = 'a-long-enough-password'): Promise<void> {
  if (mode === 'register') {
    await userEvent.type(field('Display name'), 'Ada Lovelace');
  }
  await userEvent.type(field('Email address'), 'ada@devmentor.test');
  await userEvent.type(field('Password'), password);
  await userEvent.click(screen.getByRole('button', { name: mode === 'register' ? 'Create account' : 'Sign in' }));
}

describe('the sign-in mode', () => {
  it('asks for an address and a password, and nothing else', () => {
    show('sign-in');

    expect(screen.getByRole('group', { name: 'Sign in with email' })).toBeTruthy();
    expect(field('Email address').type).toBe('email');
    expect(screen.queryByLabelText(/^Display name/)).toBeNull();
  });

  it('renders the password as a password input with the existing-credential autocomplete', () => {
    show('sign-in');
    const password = field('Password');

    // Not `text`: the credential must not be readable over the user's shoulder. And
    // `current-password`, so a password manager offers the account's existing password
    // rather than offering to generate a new one.
    expect(password.type).toBe('password');
    expect(password.autocomplete).toBe('current-password');
    expect(password.required).toBe(true);
  });

  it('posts to the login route and leaves with a full page load', async () => {
    show('sign-in');

    await submit('sign-in');

    const [path, init] = sentRequest();
    expect(path).toBe('/api/auth/login');
    expect(init.method).toBe('POST');
    expect(sentBody()).toEqual({
      email: 'ada@devmentor.test',
      password: 'a-long-enough-password',
    });
    // The header a plain HTML form post cannot set, and the reason `apiHandler` can require
    // it on every state-changing route.
    expect((init.headers as Record<string, string>)['x-devmentor-request']).toBe('1');
    // `assign`, not a client-side push: the router is holding segments rendered for a
    // signed-out visitor, and a soft navigation would show them to somebody who now has a
    // session.
    await waitFor(() => expect(assign).toHaveBeenCalledExactlyOnceWith('/home'));
  });

  it.each([
    [['mentee'], '/home'],
    [['mentor'], '/mentor'],
    [['mentee', 'operator'], '/admin'],
  ])('sends %s to %s when no returnTo was asked for', async (roles, expected) => {
    request.mockResolvedValue(envelope({ ok: true, data: { ...MENTEE, roles } }));
    show('sign-in');

    await submit('sign-in');

    // The roles come from the route's answer, so an operator does not land on `/home` only
    // to be redirected off it.
    await waitFor(() => expect(assign).toHaveBeenCalledWith(expected));
  });

  it('prefers the destination the page validated', async () => {
    request.mockResolvedValue(envelope({ ok: true, data: { ...MENTEE, roles: ['operator'] } }));
    show('sign-in', '/mentors/ada');

    await submit('sign-in');

    await waitFor(() => expect(assign).toHaveBeenCalledWith('/mentors/ada'));
  });

  it('stays put and shows the refusal when the credential is wrong', async () => {
    request.mockResolvedValue(
      envelope(
        {
          ok: false,
          error: {
            code: 'unauthorized',
            message:
              'That email address and password do not match an account. Check both and try again.',
          },
        },
        401,
      ),
    );
    show('sign-in');

    await submit('sign-in');

    expect((await screen.findByRole('alert')).textContent).toContain('do not match an account');
    // Navigating on a failure would look like a successful sign-in.
    expect(assign).not.toHaveBeenCalled();
    expect(field('Email address').value).toBe('ada@devmentor.test');
  });

  it('shows the rate-limit refusal as the form error it is', async () => {
    request.mockResolvedValue(
      envelope(
        {
          ok: false,
          error: {
            code: 'rate_limited',
            message: 'Too many attempts. Please wait a few minutes and try again.',
            retryAfterSeconds: 900,
          },
        },
        429,
      ),
    );
    show('sign-in');

    await submit('sign-in');

    expect((await screen.findByRole('alert')).textContent).toContain('Too many attempts');
    expect(assign).not.toHaveBeenCalled();
  });

  it('validates with the shared schema before anything is sent', async () => {
    show('sign-in');

    await userEvent.type(field('Email address'), 'not-an-address');
    await userEvent.type(field('Password'), 'anything');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(request).not.toHaveBeenCalled();
  });
});

describe('the register mode', () => {
  it('asks for a display name as well, and says what the password rule is', () => {
    show('register');

    expect(screen.getByRole('group', { name: 'Create an account with email' })).toBeTruthy();
    expect(field('Display name').autocomplete).toBe('nickname');
    expect(screen.getByText('Use at least 12 characters.')).toBeTruthy();
  });

  it('marks the password as a new one for a password manager', () => {
    show('register');
    const password = field('Password');

    expect(password.type).toBe('password');
    expect(password.autocomplete).toBe('new-password');
  });

  it('posts to the register route', async () => {
    request.mockResolvedValue(envelope({ ok: true, data: { email: 'ada@devmentor.test' } }));
    show('register');

    await submit('register');

    expect(sentRequest()[0]).toBe('/api/auth/register');
    expect(sentBody()).toEqual({
      displayName: 'Ada Lovelace',
      email: 'ada@devmentor.test',
      password: 'a-long-enough-password',
    });
  });

  it('carries the destination in the query, because CrudForm sends only rendered fields', async () => {
    request.mockResolvedValue(envelope({ ok: true, data: { email: 'ada@devmentor.test' } }));
    show('register', '/mentors/ada?slot=9');

    await submit('register');

    expect(sentRequest()[0]).toBe('/api/auth/register?returnTo=%2Fmentors%2Fada%3Fslot%3D9');
  });

  it('refuses a password below the minimum without sending it', async () => {
    show('register');

    await submit('register', 'short');

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(request).not.toHaveBeenCalled();
  });

  it('replaces the form with what to do next, and signs nobody in', async () => {
    request.mockResolvedValue(envelope({ ok: true, data: { email: 'ada@devmentor.test' } }));
    show('register');

    await submit('register');

    const status = await screen.findByRole('status');
    expect(status.textContent).toContain('ada@devmentor.test');
    expect(status.textContent).toContain('open the link');
    // The form is gone, so the address cannot be submitted twice by a second click; and
    // nothing navigated, because registration issues no session (`email_verified_at` gates
    // sign-in, and only the mailed link sets it).
    expect(screen.queryByRole('button', { name: 'Create account' })).toBeNull();
    expect(assign).not.toHaveBeenCalled();
  });

  it('keeps the form and the entries when registration is refused', async () => {
    request.mockResolvedValue(
      envelope(
        {
          ok: false,
          error: {
            code: 'conflict',
            message: 'An account already exists for this email address. Sign in with it instead.',
          },
        },
        409,
      ),
    );
    show('register');

    await submit('register');

    expect((await screen.findByRole('alert')).textContent).toContain('already exists');
    expect(screen.queryByRole('status')).toBeNull();
    expect(field('Display name').value).toBe('Ada Lovelace');
  });
});
