// @vitest-environment jsdom
import type { SessionListItemDto } from '@devmentor/core';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MentorSessionActions } from './mentor-session-actions';
import { OpenSessionAction } from './open-session-action';

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
  isOpen: false,
  cancellable: true,
  refundOnCancel: true,
};

describe('OpenSessionAction', () => {
  it('links to the session at its own address', () => {
    render(<OpenSessionAction session={session} />);

    const link = screen.getByRole('link', { name: 'Open text session' });
    expect(link.getAttribute('href')).toBe('/sessions/b-1');
  });

  it('offers a confirmed session whether it has started or not', () => {
    const { rerender } = render(<OpenSessionAction session={{ ...session, isPast: true }} />);
    expect(screen.getByRole('link', { name: 'Open text session' })).toBeTruthy();

    rerender(<OpenSessionAction session={{ ...session, isPast: false }} />);
    expect(screen.getByRole('link', { name: 'Open text session' })).toBeTruthy();
  });

  it.each(['pending', 'expired', 'cancelled'] as const)(
    'offers nothing for a %s booking, which has no session',
    (status) => {
      render(<OpenSessionAction session={{ ...session, status }} />);

      expect(screen.queryByRole('link')).toBeNull();
    },
  );
});

describe('MentorSessionActions', () => {
  it('offers the mentor only the way in, never a cancellation', () => {
    render(<>{MentorSessionActions(session)}</>);

    expect(screen.getByRole('link', { name: 'Open text session' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cancel session' })).toBeNull();
  });

  it('offers the mentor nothing for a booking with no session', () => {
    render(<>{MentorSessionActions({ ...session, status: 'cancelled' })}</>);

    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('MenteeSessionActions', () => {
  it('offers the way in first and the cancellation second', async () => {
    const { MenteeSessionActions } = await import('./mentee-session-actions');
    const { container } = render(<>{MenteeSessionActions(session, vi.fn())}</>);
    expect(screen.getAllByRole('link', { name: 'Open text session' })).not.toHaveLength(0);
    expect(screen.getAllByRole('button', { name: 'Cancel session' })).not.toHaveLength(0);
    // Opening is what a party is here for; the destructive action is not under the thumb.
    expect(container.querySelector('a, button')?.textContent).toBe('Open text session');
  });

  it('keeps the way in for a session that can no longer be cancelled', async () => {
    const { MenteeSessionActions } = await import('./mentee-session-actions');
    render(<>{MenteeSessionActions({ ...session, cancellable: false }, vi.fn())}</>);

    expect(screen.getByRole('link', { name: 'Open text session' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Cancel session' })).toBeNull();
  });
});
