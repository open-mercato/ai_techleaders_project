import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { apiCall } from '../../packages/ui/src/backend/api/apiCall';
import type { ApiResult } from '../../packages/ui/src/backend/api/types';
import { AuthContext, type AuthFlow } from './auth-context';
import { AuthDemoControls, AuthScreens } from './AuthScreens';
import { AUTH_ENDPOINT } from './auth-runtime';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from './auth-model';
import { navigate } from './navigation';

vi.mock('../../packages/ui/src/backend/api/apiCall', () => ({ apiCall: vi.fn() }));
vi.mock('./navigation', () => ({ navigate: vi.fn() }));

const request = vi.mocked(apiCall);
const sam = { id: 'sam', displayName: 'Sam Parker', email: 'sam@example.test', roles: ['mentor', 'operator'] as const };

function authFixture(overrides: Partial<AuthFlow> = {}): AuthFlow {
  return {
    user: null, hasSession: Boolean(overrides.user), screen: 's12', notice: null, formError: null, pendingEmail: null, returnTo: null,
    failure: 'none', githubAccount: 'jordan', githubOutcome: 'success', verification: 'valid',
    emailDisabled: false, busy: false,
    setFailure: vi.fn(), setGithubAccount: vi.fn(), setGithubOutcome: vi.fn(),
    setVerification: vi.fn(), setEmailDisabled: vi.fn(), switchMode: vi.fn(), complete: vi.fn(),
    expire: vi.fn(), operatorEligible: vi.fn(), verify: vi.fn().mockResolvedValue(undefined),
    github: vi.fn().mockResolvedValue(undefined), logout: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function renderScreens(auth = authFixture()) {
  return render(<AuthContext.Provider value={auth}><AuthScreens /></AuthContext.Provider>);
}

function region(title: string) {
  return within(screen.getByRole('region', { name: title }));
}

function completeEmailForm(title = 'Sign in') {
  const page = region(title);
  fireEvent.change(page.getByLabelText(/^Email address/), { target: { value: 'jordan@example.test' } });
  fireEvent.change(page.getByLabelText(/^Password/), { target: { value: DEMO_PASSWORD } });
  return page;
}

beforeEach(() => {
  vi.mocked(navigate).mockReset();
  request.mockReset();
  request.mockResolvedValue({ ok: true, data: { user: null } });
});
afterEach(cleanup);

it.each([
  [null, 'Welcome back', 'Back to home', 's17'],
  ['s4', 'Sign in to book your session', 'Back to your selected time', 's3'],
] as const)('keeps the sign-in destination and back navigation for %s', (returnTo, title, back, target) => {
  const auth = authFixture({ returnTo });
  renderScreens(auth);
  const page = region('Sign in');
  expect(page.getByRole('heading', { name: title })).toBeTruthy();
  fireEvent.click(page.getByRole('button', { name: back }));
  expect(navigate).toHaveBeenLastCalledWith(target);
  fireEvent.click(page.getByRole('button', { name: 'Continue with GitHub' }));
  expect(navigate).toHaveBeenLastCalledWith('s23');
  fireEvent.click(page.getByRole('button', { name: 'Create account' }));
  expect(auth.switchMode).toHaveBeenCalledWith('s20');
});

it('validates both authentication forms with the E01 schemas and leaves entered values after errors', async () => {
  renderScreens();
  const login = region('Sign in');
  fireEvent.click(login.getByRole('button', { name: 'Sign in' }));
  expect(login.getByText('Enter a valid email address.')).toBeTruthy();
  expect(document.activeElement).toBe(login.getByLabelText(/^Email address/));
  expect(request).not.toHaveBeenCalled();
  const registration = region('Create an account');
  fireEvent.click(registration.getByRole('button', { name: 'Create account' }));
  expect(registration.getByText('Enter your name.')).toBeTruthy();
  expect(document.activeElement).toBe(registration.getByLabelText(/^Display name/));
  completeEmailForm('Create an account');
  fireEvent.change(registration.getByLabelText(/^Display name/), { target: { value: 'New Mentee' } });
  fireEvent.change(registration.getByLabelText(/^Password/), { target: { value: 'short' } });
  fireEvent.click(registration.getByRole('button', { name: 'Create account' }));
  expect(registration.getAllByText('Use at least 12 characters.')).toHaveLength(2);
  expect(request).not.toHaveBeenCalled();
  fireEvent.change(registration.getByLabelText(/^Password/), { target: { value: '🦊'.repeat(19) } });
  fireEvent.click(registration.getByRole('button', { name: 'Create account' }));
  expect(registration.getByText('Use a password of 72 bytes or fewer.')).toBeTruthy();
  expect(request).not.toHaveBeenCalled();
  fireEvent.change(registration.getByLabelText(/^Password/), { target: { value: DEMO_PASSWORD } });
  request.mockResolvedValueOnce({ ok: false, error: { code: 'conflict', message: 'This address already has an account. Sign in to continue.' } });
  fireEvent.click(registration.getByRole('button', { name: 'Create account' }));
  await waitFor(() => expect(registration.getByText('This address already has an account. Sign in to continue.')).toBeTruthy());
  expect(request).toHaveBeenLastCalledWith(`${AUTH_ENDPOINT}/register`, { method: 'POST', body: { displayName: 'New Mentee', email: 'jordan@example.test', password: DEMO_PASSWORD } });
  expect(registration.getByLabelText<HTMLInputElement>(/^Display name/).value).toBe('New Mentee');
  expect(registration.getByLabelText<HTMLInputElement>(/^Password/).value).toBe(DEMO_PASSWORD);
});

it('disables competing sign-in actions while the email request is pending and leaves routing to the controller', async () => {
  let complete!: (result: ApiResult<unknown>) => void;
  request.mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
  const auth = authFixture();
  renderScreens(auth);
  const page = completeEmailForm();
  fireEvent.click(page.getByRole('button', { name: 'Sign in' }));
  expect(page.getByRole<HTMLButtonElement>('button', { name: 'Continue with GitHub' }).disabled).toBe(true);
  expect(page.getByRole<HTMLButtonElement>('button', { name: 'Create account' }).disabled).toBe(true);
  expect(request).toHaveBeenCalledWith(`${AUTH_ENDPOINT}/login`, { method: 'POST', body: { email: 'jordan@example.test', password: DEMO_PASSWORD } });
  await act(async () => complete({ ok: true, data: { user: { id: 'jordan' } } }));
  expect(page.getByRole<HTMLButtonElement>('button', { name: 'Sign in' }).disabled).toBe(false);
  expect(navigate).not.toHaveBeenCalled();
  expect(auth.complete).not.toHaveBeenCalled();
});

it.each(['unverified-email', 'github-link'] as const)('offers %s recovery with the pending email and clears the retried registration password', (formError) => {
  const auth = authFixture({ formError, pendingEmail: 'pending@example.test' });
  renderScreens(auth);
  const registration = region('Create an account');
  expect(registration.getByLabelText<HTMLInputElement>(/^Email address/).value).toBe('pending@example.test');
  fireEvent.change(registration.getByLabelText(/^Password/), { target: { value: 'stale-password' } });
  fireEvent.click(region('Sign in').getByRole('button', { name: 'Verify your email' }));
  expect(auth.switchMode).toHaveBeenCalledWith('s20');
  expect(registration.getByLabelText<HTMLInputElement>(/^Email address/).value).toBe('pending@example.test');
  expect(registration.getByLabelText<HTMLInputElement>(/^Password/).value).toBe('');
});

it.each(['check-inbox', 'verified'] as const)('keeps %s feedback on its own screen rather than in the sign-in form', notice => {
  renderScreens(authFixture({ notice }));
  expect(region('Sign in').queryByRole('status')).toBeNull();
});

it('shows session feedback and both disabled email forms while GitHub stays available', () => {
  renderScreens(authFixture({ notice: 'session-expired', emailDisabled: true }));
  const login = region('Sign in');
  expect(login.getByRole('alert', { name: 'Your session has expired' })).toBeTruthy();
  expect(login.getByRole<HTMLFieldSetElement>('group', { name: 'Sign in with email' }).disabled).toBe(true);
  expect(region('Create an account').getByRole<HTMLFieldSetElement>('group', { name: 'Create an account with email' }).disabled).toBe(true);
  expect(login.getByRole<HTMLButtonElement>('button', { name: 'Continue with GitHub' }).disabled).toBe(false);
});

it('provides sign-in and GitHub alternatives for registration conflicts', () => {
  const auth = authFixture({ formError: 'github-account' });
  renderScreens(auth);
  const page = region('Create an account');
  for (const label of ['Use GitHub sign-in', 'Continue with GitHub']) {
    fireEvent.click(page.getByRole('button', { name: label }));
    expect(navigate).toHaveBeenLastCalledWith('s23');
  }
  fireEvent.click(page.getByRole('button', { name: 'Sign in' }));
  expect(auth.switchMode).toHaveBeenCalledWith('s12');
  fireEvent.click(page.getByRole('button', { name: 'Back to home' }));
  expect(navigate).toHaveBeenLastCalledWith('s17');
});

it('opens the demo verification link for a pending email and offers registration or sign-in recovery', () => {
  const auth = authFixture({ pendingEmail: 'new@example.test' });
  renderScreens(auth);
  const page = region('Check your inbox');
  expect(page.getAllByRole('heading', { level: 1, name: 'Check your inbox' })).toHaveLength(1);
  expect(page.queryByRole('status')).toBeNull();
  expect(page.getByText('Use the verification link for new@example.test to finish creating your account.')).toBeTruthy();
  fireEvent.click(page.getByRole('button', { name: 'Open verification link' }));
  expect(auth.verify).toHaveBeenCalledOnce();
  fireEvent.click(page.getByRole('button', { name: 'Use a different email or request a new link' }));
  expect(auth.switchMode).toHaveBeenLastCalledWith('s20');
  fireEvent.click(page.getByRole('button', { name: 'Back to sign in' }));
  expect(auth.switchMode).toHaveBeenLastCalledWith('s12');
});

it('keeps failed verification and GitHub requests visible with their retry actions', () => {
  const auth = authFixture({ pendingEmail: 'new@example.test', notice: 'service-unavailable' });
  renderScreens(auth);
  const inbox = region('Check your inbox');
  expect(inbox.getByRole('alert', { name: 'We could not complete the request' })).toBeTruthy();
  expect(inbox.queryByRole('status')).toBeNull();
  fireEvent.click(inbox.getByRole('button', { name: 'Open verification link' }));
  expect(auth.verify).toHaveBeenCalledOnce();
  const github = region('GitHub response preview');
  expect(github.getByRole('alert', { name: 'We could not complete the request' })).toBeTruthy();
  fireEvent.click(github.getByRole('button', { name: 'Continue with demo account' }));
  expect(auth.github).toHaveBeenCalledOnce();
});

it.each([{ pendingEmail: null, busy: false }, { pendingEmail: 'new@example.test', busy: true }])('does not open verification without a pending account or while busy: %j', overrides => {
  const auth = authFixture(overrides);
  renderScreens(auth);
  const open = region('Check your inbox').getByRole<HTMLButtonElement>('button', { name: 'Open verification link' });
  expect(open.disabled).toBe(true);
  fireEvent.click(open);
  expect(auth.verify).not.toHaveBeenCalled();
});

it.each([
  ['verification-expired', 'This verification link has expired'],
  ['verification-invalid', 'This verification link is not valid'],
  ['service-unavailable', 'We could not complete the request'],
  ['rate-limited', 'Please wait before trying again'],
  [null, 'This verification link is not valid'],
] as const)('shows %s verification recovery and routes to a new link request', (notice, title) => {
  const auth = authFixture({ notice });
  renderScreens(auth);
  const page = region('Email verification');
  expect(page.getByRole('alert', { name: title })).toBeTruthy();
  fireEvent.click(page.getByRole('button', { name: 'Request a new verification link' }));
  expect(auth.switchMode).toHaveBeenLastCalledWith('s20');
  fireEvent.click(page.getByRole('button', { name: 'Back to sign in' }));
  expect(auth.switchMode).toHaveBeenLastCalledWith('s12');
});

it.each([[null, 'Open my workspace'], ['s4', 'Continue with your booking']] as const)('continues after verification to %s', (returnTo, action) => {
  const auth = authFixture({ notice: 'verified', returnTo });
  renderScreens(auth);
  const page = region('Email verification');
  expect(page.getByRole('status', { name: 'Email verified' })).toBeTruthy();
  fireEvent.click(page.getByRole('button', { name: action }));
  expect(auth.complete).toHaveBeenCalledOnce();
});

it('selects GitHub accounts and outcomes and delegates success or cancellation', () => {
  const auth = authFixture();
  renderScreens(auth);
  const page = region('GitHub response preview');
  expect(page.getByText('Choose the account and response to test. In the application, GitHub handles this step.')).toBeTruthy();
  fireEvent.change(page.getByRole('combobox', { name: 'GitHub demo account' }), { target: { value: 'sam' } });
  expect(auth.setGithubAccount).toHaveBeenCalledWith('sam');
  for (const outcome of ['success', 'cancelled', 'state', 'unavailable', 'email', 'link']) {
    fireEvent.change(page.getByRole('combobox', { name: 'GitHub response' }), { target: { value: outcome } });
    expect(auth.setGithubOutcome).toHaveBeenLastCalledWith(outcome);
  }
  fireEvent.click(page.getByRole('button', { name: 'Continue with demo account' }));
  expect(auth.github).toHaveBeenLastCalledWith();
  fireEvent.click(page.getByRole('button', { name: 'Cancel sign-in' }));
  expect(auth.github).toHaveBeenLastCalledWith(true);
});

it('disables GitHub controls while a callback is pending', () => {
  const auth = authFixture({ busy: true });
  renderScreens(auth);
  const page = region('GitHub response preview');
  for (const select of page.getAllByRole<HTMLSelectElement>('combobox')) expect(select.disabled).toBe(true);
  expect(page.getByRole<HTMLButtonElement>('button', { name: 'Checking response…' }).disabled).toBe(true);
  const cancel = page.getByRole<HTMLButtonElement>('button', { name: 'Cancel sign-in' });
  expect(cancel.disabled).toBe(true);
  fireEvent.click(cancel);
  expect(auth.github).not.toHaveBeenCalled();
});

it('renders the operator workspace and user directory from the authorized account', () => {
  const auth = authFixture({ user: { ...sam, roles: [...sam.roles] } });
  renderScreens(auth);
  fireEvent.click(region('Operator home').getByRole('button', { name: 'View users' }));
  expect(navigate).toHaveBeenCalledWith('s25');
  const users = region('Operator users');
  const table = users.getByRole('table', { name: 'Demo users' });
  const rows = within(table).getAllByRole('row');
  expect(rows).toHaveLength(DEMO_ACCOUNTS.length);
  expect(within(table).queryByText('robin@example.test')).toBeNull();
  const operator = within(table).getByRole('row', { name: /Sam Parker/ });
  expect(within(operator).getByText('operator')).toBeTruthy();
  expect(within(operator).getByText('mentor')).toBeTruthy();
  expect(users.queryByRole('button', { name: /edit|grant|assign/i })).toBeNull();
});

it.each([null, { ...sam, roles: ['mentor'] as ['mentor'] }])('renders no operator data when access is missing: %j', user => {
  renderScreens(authFixture({ user }));
  expect(region('Operator users').queryByRole('table')).toBeNull();
  expect(region('Operator users').queryByText('jordan@example.test')).toBeNull();
  expect(region('Operator home').queryByRole('button', { name: 'View users' })).toBeNull();
});

it('keeps demo failure, verification and release controls separate from product role management', () => {
  const auth = authFixture({ user: { ...sam, roles: [...sam.roles] } });
  render(<AuthContext.Provider value={auth}><AuthDemoControls /></AuthContext.Provider>);
  const controls = within(screen.getByRole('complementary', { name: 'Authentication demo controls' }));
  expect(controls.getByText(DEMO_PASSWORD)).toBeTruthy();
  fireEvent.change(controls.getByRole('combobox', { name: 'Next request result' }), { target: { value: 'mail-unavailable' } });
  expect(auth.setFailure).toHaveBeenCalledWith('mail-unavailable');
  fireEvent.change(controls.getByRole('combobox', { name: 'Verification link' }), { target: { value: 'expired' } });
  expect(auth.setVerification).toHaveBeenCalledWith('expired');
  fireEvent.click(controls.getByRole('checkbox', { name: 'Preview GitHub-only release' }));
  expect(auth.setEmailDisabled).toHaveBeenCalledWith(true);
  fireEvent.click(controls.getByRole('button', { name: 'Expire demo session' }));
  expect(auth.expire).toHaveBeenCalledOnce();
  fireEvent.click(controls.getByRole('button', { name: 'Remove Sam’s operator access' }));
  expect(auth.operatorEligible).toHaveBeenLastCalledWith(false);
  fireEvent.click(controls.getByRole('button', { name: 'Restore Sam’s operator access' }));
  expect(auth.operatorEligible).toHaveBeenLastCalledWith(true);
});

it.each([{ user: null, busy: false }, { user: { ...sam, roles: [...sam.roles] }, busy: true }])('does not expire an absent or busy session: %j', overrides => {
  const auth = authFixture(overrides);
  render(<AuthContext.Provider value={auth}><AuthDemoControls /></AuthContext.Provider>);
  const expire = screen.getByRole<HTMLButtonElement>('button', { name: 'Expire demo session' });
  expect(expire.disabled).toBe(true);
  fireEvent.click(expire);
  expect(auth.expire).not.toHaveBeenCalled();
});
