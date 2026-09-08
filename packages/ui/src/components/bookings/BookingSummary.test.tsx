// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { BookingSummary, CancellationSummary } from './BookingSummary';
afterEach(cleanup);
const booking = { mentorName: 'Alex', startsAt: '2026-09-09T12:00:00Z', dateLabel: '9 September 2026', timeLabel: '14:00–14:25', timeZone: 'Europe/Warsaw', duration: 25 as const, total: 'EUR 45.00' };
it('shows supplied price, zoned time and payment confirmation conditions without inventing a charge', () => {
  const { container, rerender } = render(<BookingSummary {...booking} />);
  expect(screen.getByRole('region', { name: 'Your session with Alex' })).toBeTruthy();
  expect(screen.getByText(booking.dateLabel).getAttribute('datetime')).toBe(booking.startsAt);
  expect(screen.getByText(booking.timeLabel)).toBeTruthy();
  expect(screen.getByText(booking.timeZone)).toBeTruthy();
  expect(container.textContent).not.toMatch(/[·•]/);
  expect(screen.getByText('25-minute text session')).toBeTruthy();
  expect(screen.getByText(booking.total)).toBeTruthy();
  expect(screen.queryByRole('status')).toBeNull();
  rerender(<BookingSummary {...booking} notice="Reserved until 13:30 UTC." actions={<button>Continue to checkout</button>} />);
  expect(screen.getByRole('status').textContent).toBe('Reserved until 13:30 UTC.');
  expect(screen.getByRole('button', { name: 'Continue to checkout' })).toBeTruthy();
});
it('presents the cancellation consequence and refund provided by the caller', () => {
  render(<CancellationSummary sessionLabel="9 September with Alex" paid="EUR 45.00" refund="EUR 0.00" consequence="This cancellation is within 24 hours. The fee is forfeited." actions={<button>Review cancellation</button>} />);
  expect(screen.getByText('EUR 0.00')).toBeTruthy();
  expect(screen.getByText(/fee is forfeited/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Review cancellation' })).toBeTruthy();
});
