// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiResult } from '@devmentor/ui/backend';
import { apiCall } from '@devmentor/ui/backend';
import { AcceptInvitationAction, InvitationSignOutAction } from './invitation-actions';

vi.mock('@devmentor/ui/backend', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@devmentor/ui/backend')>()),
  apiCall: vi.fn(),
}));

const request = vi.mocked(apiCall);
const assign = vi.fn();

beforeEach(() => {
  request.mockReset();
  assign.mockReset();
  vi.stubGlobal('location', { assign });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AcceptInvitationAction', () => {
  it('posts through apiCall and hard-navigates to the mentor home', async () => {
    request.mockResolvedValue({ ok: true, data: {} });
    render(<AcceptInvitationAction token="raw token" />);
    await userEvent.click(screen.getByRole('button', { name: 'Accept invitation' }));
    expect(request).toHaveBeenCalledWith('/api/invitations/raw%20token/accept', {
      method: 'POST',
    });
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/mentor'));
  });

  it('disables itself while accepting and shows a server refusal without navigating', async () => {
    let release!: (value: ApiResult<unknown>) => void;
    request.mockReturnValue(new Promise((resolve) => (release = resolve)));
    render(<AcceptInvitationAction token="secret" />);
    await userEvent.click(screen.getByRole('button', { name: 'Accept invitation' }));
    expect(
      (screen.getByRole('button', { name: 'Accepting invitation…' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    release({ ok: false, error: { code: 'forbidden', message: 'Use the invited account.' } });
    expect((await screen.findByRole('alert')).textContent).toContain('Use the invited account.');
    expect(
      (screen.getByRole('button', { name: 'Accept invitation' }) as HTMLButtonElement).disabled,
    ).toBe(false);
    expect(assign).not.toHaveBeenCalled();
  });
});

describe('InvitationSignOutAction', () => {
  it('signs out through apiCall and reloads the invitation', async () => {
    request.mockResolvedValue({ ok: true, data: null });
    render(<InvitationSignOutAction returnTo="/invitation/secret" />);
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(request).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' });
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/invitation/secret'));
  });

  it('keeps the visitor in place and reports a failed sign-out', async () => {
    let release!: (value: ApiResult<unknown>) => void;
    request.mockReturnValue(new Promise((resolve) => (release = resolve)));
    render(<InvitationSignOutAction returnTo="/invitation/secret" />);
    await userEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect((screen.getByRole('button', { name: 'Signing out…' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    release({ ok: false, error: { code: 'network_error', message: 'Try again.' } });
    expect((await screen.findByRole('alert')).textContent).toContain('Try again.');
    expect((screen.getByRole('button', { name: 'Sign out' }) as HTMLButtonElement).disabled).toBe(
      false,
    );
    expect(assign).not.toHaveBeenCalled();
  });
});
