// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { AccessStatus } from './AccessStatus';
afterEach(cleanup);

it.each([
  ['check-inbox', 'Check your inbox'], ['verified', 'Email verified'], ['session-expired', 'Your session has expired'],
  ['forbidden', 'This page is not available to your account'], ['oauth-cancelled', 'Sign-in was cancelled'], ['method-unavailable', 'This sign-in method is unavailable'],
  ['invitation-invalid', 'Invitation not recognized'], ['invitation-expired', 'This invitation has expired'], ['invitation-used', 'This invitation has already been accepted'], ['invitation-accepted', 'Welcome to DevMentor'],
] as const)('renders %s with an accessible heading', (state, title) => {
  render(<AccessStatus state={state} />);
  expect(screen.getByRole('region', { name: title })).toBeTruthy();
  expect(screen.queryByRole('link')).toBeNull();
});

it('includes authoritative deadline and recovery action when supplied', () => {
  render(<AccessStatus state="invitation-accepted" detail="Publish your first session by 21 September." actions={<a href="#profile">Complete profile</a>} />);
  expect(screen.getByText('Publish your first session by 21 September.')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Complete profile' })).toBeTruthy();
});
