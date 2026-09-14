// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { BookedBanner } from './booked-banner';

afterEach(cleanup);

it('acknowledges the payment without claiming the booking is confirmed', () => {
  render(<BookedBanner />);

  const banner = screen.getByRole('status');
  expect(banner.textContent).toContain('Your payment was sent');
  // Only a verified webhook confirms a booking. Returning from a checkout proves nothing,
  // so this is the one place the product must not say it did.
  expect(banner.textContent).not.toMatch(/is confirmed|booking confirmed/i);
  expect(banner.textContent).toContain('once the payment is verified');
});
