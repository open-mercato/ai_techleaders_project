// @vitest-environment jsdom

/**
 * The sign-out action, which is `WorkflowAction`'s first consumer (**F4**). Its own behaviour
 * is tested in `WorkflowAction.test.tsx`; what is asserted here is the configuration only
 * this component decides — the endpoint, the copy, and above all the **hard** navigation.
 *
 * `window.location` is replaced rather than spied on: its members are unforgeable, so jsdom
 * refuses to redefine `assign` on the real object.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ApiResult } from '../../backend/api/types';
import { apiCall } from '../../backend/api/apiCall';
import { SignOutAction } from './SignOutAction';

vi.mock('../../backend/api/apiCall', () => ({ apiCall: vi.fn() }));

const request = vi.mocked(apiCall);
const assign = vi.fn();

beforeEach(() => {
  request.mockReset();
  request.mockResolvedValue({ ok: true, data: null });
  assign.mockReset();
  vi.stubGlobal('location', { assign, href: 'http://devmentor.test/mentor' });
});

afterEach(() => {
  vi.unstubAllGlobals();
  cleanup();
});

function button(name: string): HTMLButtonElement {
  return screen.getByRole('button', { name }) as HTMLButtonElement;
}

it('posts to the logout route and leaves with a full page load', async () => {
  render(<SignOutAction />);

  await userEvent.click(button('Sign out'));

  expect(request).toHaveBeenCalledExactlyOnceWith('/api/auth/logout', {
    method: 'POST',
    body: undefined,
  });
  // `assign`, not a client-side push. The router still holds segments rendered for the
  // session that was just invalidated, so a soft navigation would show the signed-in header
  // and nav of a user who no longer has a session.
  await waitFor(() => expect(assign).toHaveBeenCalledExactlyOnceWith('/'));
});

it('says what it is doing while the request is in flight', async () => {
  let release!: (result: ApiResult<unknown>) => void;
  request.mockReturnValue(new Promise<ApiResult<unknown>>((resolve) => (release = resolve)));
  render(<SignOutAction />);

  await userEvent.click(button('Sign out'));

  expect(button('Signing out…').disabled).toBe(true);
  expect(assign).not.toHaveBeenCalled();

  release({ ok: true, data: null });
  await waitFor(() => expect(assign).toHaveBeenCalledOnce());
});

it('keeps the user where they are when sign-out fails', async () => {
  request.mockResolvedValue({
    ok: false,
    error: { code: 'forbidden', message: 'This request must carry the x-devmentor-request header.' },
  });
  render(<SignOutAction />);

  await userEvent.click(button('Sign out'));

  expect((await screen.findByRole('alert')).textContent).toBe(
    'This request must carry the x-devmentor-request header.',
  );
  // No navigation on a failure: sending them to `/` would look like a successful sign-out
  // while their cookie is still live.
  expect(assign).not.toHaveBeenCalled();
  expect(button('Sign out').disabled).toBe(false);
});
