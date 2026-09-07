// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { PaymentStatus, ConnectStatus, PayoutStatus } from './PaymentStatus';
afterEach(cleanup);
it.each([
  ['redirecting', 'Opening secure checkout'], ['pending', 'Waiting for payment confirmation'], ['confirmed', 'Your booking is confirmed'], ['failed', 'Payment could not be confirmed'], ['expired', 'The reservation has expired'], ['slot-taken', 'This time is no longer available'], ['refund-pending', 'Refund in progress'], ['refunded', 'Refund confirmed'], ['refund-failed', 'Refund needs attention'],
] as const)('renders authoritative %s payment state', (state, title) => {
  render(<PaymentStatus state={state} />);
  expect(screen.getByRole('heading', { name: title })).toBeTruthy();
  expect(screen.getByRole('status').textContent).toContain(title);
  expect(screen.queryByText(/Reference:/)).toBeNull();
});
it('shows a payment reference and a caller-selected recovery action', () => {
  render(<PaymentStatus state="failed" reference="payment_123" actions={<button>Check payment status</button>} />);
  expect(screen.getByText('payment_123')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Check payment status' })).toBeTruthy();
  expect(screen.queryByText(/Nothing was charged/)).toBeNull();
});
it.each(['incomplete', 'pending', 'enabled', 'restricted'] as const)('renders %s connected-account requirements', state => {
  render(<ConnectStatus state={state} actions={<a href="#stripe">View account</a>} />);
  expect(screen.getByRole('heading')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'View account' })).toBeTruthy();
});
it.each(['held', 'scheduled', 'transferred', 'failed'] as const)('renders %s transfer with supplied financial amounts and policy', state => {
  render(<PayoutStatus state={state} gross="EUR 80" fee="EUR 16" net="EUR 64" detail="Waiting for the provider update." />);
  expect(screen.getByText('EUR 64')).toBeTruthy();
  expect(screen.getByText('EUR 16')).toBeTruthy();
  expect(screen.getByText('Waiting for the provider update.')).toBeTruthy();
});
