// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SessionCard, SessionHeader, NotificationItem } from './SessionCard';
afterEach(cleanup);
it.each(['upcoming', 'open', 'ended', 'cancelled'] as const)('shows %s session details with text format and timezone', state => {
  const { container } = render(<><SessionCard title="Review a TypeScript API" participant="Alex" startsAt="2026-09-09T12:00:00Z" dateLabel="9 September, 14:00" timeZone="Europe/Warsaw" duration={50} state={state} actions={<a href="#session">Session details</a>} /><SessionHeader title="TypeScript API" state={state} participants="Alex and Jamie" schedule="14:00–14:50 Europe/Warsaw" notice="The written answer will follow this session." /></>);
  expect(screen.getByText('50-minute text session')).toBeTruthy();
  expect(screen.getByText('9 September, 14:00').getAttribute('datetime')).toBe('2026-09-09T12:00:00Z');
  expect(screen.getByText('Text session')).toBeTruthy();
  expect(screen.getByText('Europe/Warsaw')).toBeTruthy();
  expect(screen.getByText('Alex and Jamie')).toBeTruthy();
  expect(screen.getByText('14:00–14:50 Europe/Warsaw')).toBeTruthy();
  expect(container.textContent).not.toMatch(/[·•]/);
  expect(screen.getByRole('link', { name: 'Session details' })).toBeTruthy();
});
it('marks an unread notification as read through a callback and hides redundant actions', () => {
  const onMarkRead = vi.fn();
  const props = { title: 'Your booking is confirmed', description: 'Your text session with Alex is scheduled.', createdAt: '2026-09-07T10:00:00Z', timeLabel: 'Just now', href: '#session', onMarkRead };
  const { rerender } = render(<NotificationItem {...props} read={false} />);
  expect(screen.getByText('Unread')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Mark as read' }));
  expect(onMarkRead).toHaveBeenCalledOnce();
  rerender(<NotificationItem {...props} read />);
  expect(screen.getByText('Read')).toBeTruthy();
  expect(screen.queryByRole('button')).toBeNull();
  expect(screen.getByRole('link').getAttribute('href')).toBe('#session');
});
