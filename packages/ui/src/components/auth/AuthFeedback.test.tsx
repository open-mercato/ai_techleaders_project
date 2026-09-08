// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AuthFeedback } from './AuthFeedback';

afterEach(cleanup);

it.each([
  ['invalid-credentials', 'Email or password is incorrect', 'alert'],
  ['unverified-email', 'Verify your email to sign in', 'alert'],
  ['github-account', 'Use GitHub for this account', 'alert'],
  ['account-exists', 'An account already uses this email', 'alert'],
  ['github-cancelled', 'GitHub sign-in was cancelled', 'status'],
  ['github-state', 'Restart GitHub sign-in', 'alert'],
  ['github-unavailable', 'GitHub sign-in is unavailable', 'alert'],
  ['github-email', 'Verify your primary email on GitHub', 'alert'],
  ['github-link', 'Verify your DevMentor email first', 'alert'],
  ['rate-limited', 'Please wait before trying again', 'alert'],
  ['service-unavailable', 'We could not complete the request', 'alert'],
  ['mail-unavailable', 'The verification email was not sent', 'alert'],
  ['session-expired', 'Your session has expired', 'alert'],
  ['forbidden', 'This page is not available to your account', 'alert'],
  ['signed-out', 'You are signed out', 'status'],
  ['verification-expired', 'This verification link has expired', 'alert'],
  ['verification-invalid', 'This verification link is not valid', 'alert'],
  ['verified', 'Email verified', 'status'],
  ['check-inbox', 'Check your inbox', 'status'],
  ['operator-revoked', 'Operator access is no longer available', 'alert'],
] as const)('announces %s with its title and appropriate urgency', (state, title, role) => {
  render(<AuthFeedback state={state} />);
  const feedback = screen.getByRole(role, { name: title });
  expect(feedback.textContent?.length).toBeGreaterThan(title.length);
  expect(screen.queryByRole('button')).toBeNull();
});

it('displays supplied recovery context and actions without performing authentication', () => {
  const resend = vi.fn();
  render(<AuthFeedback state="check-inbox" detail="Sent to jordan@example.test." actions={<button onClick={resend}>Resend verification email</button>} />);
  expect(screen.getByText('Sent to jordan@example.test.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Resend verification email' }));
  expect(resend).toHaveBeenCalledOnce();
});

it('keeps repeated titles independently labelled', () => {
  render(<><AuthFeedback state="verified" /><AuthFeedback state="verified" /></>);
  const [first, second] = screen.getAllByRole('status', { name: 'Email verified' });
  expect(first!.getAttribute('aria-labelledby')).not.toBe(second!.getAttribute('aria-labelledby'));
});
