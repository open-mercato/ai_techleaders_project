// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { NotificationDto } from '@devmentor/core';

const api = vi.hoisted(() => ({
  useApiResource: vi.fn(),
  apiCall: vi.fn(),
  reload: vi.fn(),
}));
vi.mock('@devmentor/ui/backend', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@devmentor/ui/backend')>()),
  useApiResource: api.useApiResource,
  apiCall: api.apiCall,
}));

const { UnreadNotifications } = await import('./unread-notifications');

afterEach(cleanup);

const unread: NotificationDto = {
  id: 'n-1',
  kind: 'booking_confirmed',
  bookingId: 'b-1',
  createdAt: '2026-09-14T12:00:00.000Z',
  readAt: null,
};

function resolves(data: NotificationDto[]) {
  api.useApiResource.mockReturnValue({
    data,
    loading: false,
    error: undefined,
    reload: api.reload,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resolves([unread]);
  api.apiCall.mockResolvedValue({ ok: true, data: { ...unread, readAt: '2026-09-14T12:01:00.000Z' } });
});

describe('UnreadNotifications', () => {
  it('counts what is unread, in words that match the count', () => {
    render(<UnreadNotifications as="mentee" />);

    expect(screen.getByRole('heading', { name: '1 unread notification' })).toBeTruthy();

    cleanup();
    resolves([unread, { ...unread, id: 'n-2' }]);
    render(<UnreadNotifications as="mentee" />);
    expect(screen.getByRole('heading', { name: '2 unread notifications' })).toBeTruthy();
  });

  it('reads the time out rather than printing the machine instant', () => {
    render(<UnreadNotifications as="mentee" />);

    const stamp = screen.getByText('14 September at 12:00');
    expect(stamp.getAttribute('datetime')).toBe('2026-09-14T12:00:00.000Z');
  });

  it('sends each side to its own sessions list', () => {
    render(<UnreadNotifications as="mentee" />);
    expect(screen.getByRole('link', { name: 'A session was booked' }).getAttribute('href'))
      .toBe('/home');

    cleanup();
    render(<UnreadNotifications as="mentor" />);
    expect(screen.getByRole('link', { name: 'A session was booked' }).getAttribute('href'))
      .toBe('/mentor/sessions');
  });

  it('names a cancellation and points at the same list', () => {
    resolves([{ ...unread, kind: 'booking_cancelled' }]);
    render(<UnreadNotifications as="mentor" />);

    expect(screen.getByRole('link', { name: 'A session was cancelled' }).getAttribute('href'))
      .toBe('/mentor/sessions');
    expect(screen.getByText(/The time is free again/)).toBeTruthy();
  });

  it('sends a held payout to the payouts screen, not the sessions list', () => {
    resolves([{ ...unread, kind: 'payout_held' }]);
    render(<UnreadNotifications as="mentor" />);

    // About money rather than a session, and its detail is on a different screen.
    expect(screen.getByRole('link', { name: 'A payout is waiting' }).getAttribute('href'))
      .toBe('/mentor/payouts');
    expect(screen.getByText(/payout account is set up/)).toBeTruthy();
  });

  it('marks one read and stops showing it, without waiting for the server', async () => {
    render(<UnreadNotifications as="mentee" />);

    fireEvent.click(screen.getByRole('button', { name: 'Mark as read' }));

    // Optimistic: the row is already written, so the worst a failed mark-read does is show
    // the item again on the next load.
    expect(screen.queryByRole('heading', { name: /unread/ })).toBeNull();
    await waitFor(() => expect(api.apiCall).toHaveBeenCalledWith('/api/notifications', {
      body: { id: 'n-1' },
    }));
  });

  it('says so when marking read was refused', async () => {
    api.apiCall.mockResolvedValue({
      ok: false,
      error: { code: 'forbidden', message: 'That is not yours.' },
    });
    resolves([unread, { ...unread, id: 'n-2' }]);
    render(<UnreadNotifications as="mentee" />);

    fireEvent.click(screen.getAllByRole('button', { name: 'Mark as read' })[0]!);

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain(
      'That is not yours.',
    ));
  });

  it('renders nothing at all when there is nothing unread', () => {
    resolves([{ ...unread, readAt: '2026-09-14T12:01:00.000Z' }]);
    const { container } = render(<UnreadNotifications as="mentee" />);

    // A permanent "no notifications" box on a home screen trains people to stop looking.
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing while loading, and nothing when the read failed', () => {
    api.useApiResource.mockReturnValue({
      data: undefined, loading: true, error: undefined, reload: api.reload,
    });
    expect(render(<UnreadNotifications as="mentee" />).container.firstChild).toBeNull();

    cleanup();
    api.useApiResource.mockReturnValue({
      data: undefined, loading: false, error: 'offline', reload: api.reload,
    });
    // Silent on purpose: this is a secondary line on someone else's screen, and an alert
    // about it would be louder than the thing it is reporting.
    expect(render(<UnreadNotifications as="mentee" />).container.firstChild).toBeNull();
  });

  it('treats an answer with no rows as nothing unread', () => {
    api.useApiResource.mockReturnValue({
      data: undefined, loading: false, error: undefined, reload: api.reload,
    });

    expect(render(<UnreadNotifications as="mentee" />).container.firstChild).toBeNull();
  });
});
