// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionListItemDto } from '@devmentor/core';

const api = vi.hoisted(() => ({ apiCall: vi.fn() }));
vi.mock('@devmentor/ui/backend', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@devmentor/ui/backend')>()),
  apiCall: api.apiCall,
}));

const { CancelSessionAction, cancellationConsequence } = await import('./cancel-session-action');
const { MenteeSessionActions } = await import('./mentee-session-actions');

afterEach(cleanup);

const session: SessionListItemDto = {
  id: 'b-1',
  counterpartName: 'Mock Mentor',
  lengthMinutes: 25,
  priceCents: 12_000,
  currency: 'PLN',
  status: 'confirmed',
  refundStatus: 'none',
  startsAt: '2026-09-20T09:00:00.000Z',
  isPast: false,
  cancellable: true,
  refundOnCancel: true,
};

const onCancelled = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  api.apiCall.mockResolvedValue({
    ok: true,
    data: { id: 'b-1', status: 'cancelled', refundStatus: 'refunded', refundedAmountCents: 12_000 },
  });
});

function open(overrides: Partial<SessionListItemDto> = {}) {
  render(<CancelSessionAction session={{ ...session, ...overrides }} onCancelled={onCancelled} />);
  fireEvent.click(screen.getByRole('button', { name: 'Cancel session' }));
}

describe('cancellationConsequence', () => {
  it('states the refund outcome plainly, both ways', () => {
    expect(cancellationConsequence(session)).toContain('the full amount is refunded');
    expect(cancellationConsequence({ ...session, refundOnCancel: false }))
      .toContain('the fee is not refunded');
    // The time is freed either way; only the money differs.
    expect(cancellationConsequence({ ...session, refundOnCancel: false }))
      .toContain('freed for someone else');
  });
});

describe('MenteeSessionActions', () => {
  it('offers cancelling only where the server says it is possible', () => {
    expect(MenteeSessionActions(session, onCancelled)).not.toBeNull();
    // A disabled action invites the click and then refuses it.
    expect(MenteeSessionActions({ ...session, cancellable: false }, onCancelled)).toBeNull();
  });
});

describe('CancelSessionAction', () => {
  it('states what happens to the money before the mentee confirms (R09)', async () => {
    open();

    await waitFor(() => expect(screen.getByRole('alertdialog')).toBeTruthy());
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.textContent).toContain('the full amount is refunded');
    expect(dialog.textContent).toContain('PLN 120.00');
    expect(dialog.textContent).toContain('25-minute text session with Mock Mentor');
    // Nothing has been asked of the server yet.
    expect(api.apiCall).not.toHaveBeenCalled();
  });

  it('shows a refund of nothing when the window has closed', async () => {
    open({ refundOnCancel: false });

    await waitFor(() => expect(screen.getByRole('alertdialog')).toBeTruthy());
    expect(screen.getByRole('alertdialog').textContent).toContain('PLN 0.00');
    expect(screen.getByRole('alertdialog').textContent).toContain('the fee is not refunded');
  });

  it('cancels on confirmation and lets the list re-read itself', async () => {
    open();
    await waitFor(() => expect(screen.getByRole('alertdialog')).toBeTruthy());

    // The trigger and the dialog's own action share a label; the last one is inside it.
    fireEvent.click(screen.getAllByRole('button', { name: 'Cancel session' }).at(-1)!);
    await waitFor(() => expect(api.apiCall).toHaveBeenCalledWith('/api/bookings/b-1/cancel', {
      method: 'POST',
    }));
    await waitFor(() => expect(onCancelled).toHaveBeenCalledOnce());
  });

  it('keeps the dialog open and says why when the server refuses', async () => {
    api.apiCall.mockResolvedValue({
      ok: false,
      error: { code: 'conflict', message: 'This session has already started.' },
    });
    open();
    await waitFor(() => expect(screen.getByRole('alertdialog')).toBeTruthy());

    const confirm = screen.getAllByRole('button', { name: 'Cancel session' }).at(-1)!;
    fireEvent.click(confirm);

    // A refusal dismissed along with the dialog showing it would never be read.
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain(
      'This session has already started.',
    ));
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(onCancelled).not.toHaveBeenCalled();
  });

  it('offers a way out that changes nothing', async () => {
    open();
    await waitFor(() => expect(screen.getByRole('alertdialog')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Keep the session' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(api.apiCall).not.toHaveBeenCalled();
  });
});
