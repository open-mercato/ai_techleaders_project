// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { apiCall } from '../../backend/api/apiCall';
import type { ApiResult } from '../../backend/api/types';
import { AccountForm, type AccountFormProps } from './AccountForm';
import { AuthFeedback } from './AuthFeedback';

vi.mock('../../backend/api/apiCall', () => ({ apiCall: vi.fn() }));
const request = vi.mocked(apiCall);
const schema = z.object({ email: z.email('Enter a valid email address.'), password: z.string().min(1, 'Enter your password.') });
const registerSchema = schema.extend({ displayName: z.string().min(1, 'Enter your display name.'), password: z.string().min(12, 'Use at least 12 characters.') });
const initialValues = { email: 'jordan@example.test', password: 'example-password' };

function props(overrides: Partial<AccountFormProps> = {}): AccountFormProps {
  return { mode: 'sign-in', schema, endpoint: '/api/auth/login', onSuccess: vi.fn(), onGitHub: vi.fn(), onSwitchMode: vi.fn(), ...overrides };
}

beforeEach(() => {
  request.mockReset();
  request.mockResolvedValue({ ok: true, data: { id: 'fictional-mentee' } });
});
afterEach(cleanup);

it('offers neutral GitHub before the primary email action and delegates provider and mode selection', () => {
  const callbacks = props();
  render(<AccountForm {...callbacks} />);
  const github = screen.getByRole('button', { name: 'Continue with GitHub' });
  const submit = screen.getByRole('button', { name: 'Sign in' });
  expect(github.className).toContain('dm-button-neutral');
  expect(github.className).toContain('dm-button-stroke');
  expect(submit.className).toContain('dm-button-primary');
  expect(screen.getAllByRole('button')).toEqual([github, submit, screen.getByRole('button', { name: 'Create account' })]);
  expect(screen.getByRole('group', { name: 'Sign in with email' })).toBeTruthy();
  expect(screen.getByLabelText<HTMLInputElement>(/^Password/).type).toBe('password');
  expect(screen.getByLabelText(/^Password/).getAttribute('autocomplete')).toBe('current-password');
  expect(screen.getByLabelText(/^Email address/).getAttribute('autocomplete')).toBe('email');
  fireEvent.click(github);
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
  expect(callbacks.onGitHub).toHaveBeenCalledOnce();
  expect(callbacks.onSwitchMode).toHaveBeenCalledOnce();
  expect(request).not.toHaveBeenCalled();
});

it('validates with the supplied registration schema and submits all registration fields', async () => {
  const callbacks = props({ mode: 'register', schema: registerSchema, endpoint: '/api/auth/register' });
  render(<AccountForm {...callbacks} />);
  const form = screen.getByRole('group', { name: 'Create an account with email' });
  const name = within(form).getByLabelText<HTMLInputElement>(/^Display name/);
  const email = within(form).getByLabelText<HTMLInputElement>(/^Email address/);
  const password = within(form).getByLabelText<HTMLInputElement>(/^Password/);
  expect(password.getAttribute('autocomplete')).toBe('new-password');
  expect(document.getElementById(password.getAttribute('aria-describedby')!)?.textContent).toBe('Use at least 12 characters.');
  expect(name.getAttribute('autocomplete')).toBe('nickname');
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
  expect(screen.getByText('Enter your display name.')).toBeTruthy();
  expect(document.activeElement).toBe(name);
  expect(request).not.toHaveBeenCalled();
  fireEvent.change(name, { target: { value: 'Jordan Lee' } });
  fireEvent.change(email, { target: { value: initialValues.email } });
  fireEvent.change(password, { target: { value: initialValues.password } });
  fireEvent.click(screen.getByRole('button', { name: 'Create account' }));
  await waitFor(() => expect(callbacks.onSuccess).toHaveBeenCalledWith({ id: 'fictional-mentee' }));
  expect(request).toHaveBeenCalledWith('/api/auth/register', { method: 'POST', body: { ...initialValues, displayName: 'Jordan Lee' } });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  expect(callbacks.onSwitchMode).toHaveBeenCalledOnce();
});

it('preserves credentials after a server error and disables duplicate email submissions while pending', async () => {
  let complete!: (result: ApiResult<unknown>) => void;
  request.mockReturnValueOnce(new Promise(resolve => { complete = resolve; }));
  const callbacks = props({ initialValues });
  render(<AccountForm {...callbacks} />);
  const form = screen.getByRole('button', { name: 'Sign in' }).closest('form')!;
  act(() => { fireEvent.submit(form); fireEvent.submit(form); });
  expect(request).toHaveBeenCalledOnce();
  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Saving…' }).disabled).toBe(true);
  expect(screen.getByLabelText<HTMLInputElement>(/^Password/).disabled).toBe(true);
  expect(form.getAttribute('aria-busy')).toBe('true');
  const github = screen.getByRole<HTMLButtonElement>('button', { name: 'Continue with GitHub' });
  const switchMode = screen.getByRole<HTMLButtonElement>('button', { name: 'Create account' });
  expect(github.disabled).toBe(true);
  expect(switchMode.disabled).toBe(true);
  fireEvent.click(github);
  fireEvent.click(switchMode);
  expect(callbacks.onGitHub).not.toHaveBeenCalled();
  expect(callbacks.onSwitchMode).not.toHaveBeenCalled();
  await act(async () => complete({ ok: false, error: { code: 'invalid_credentials', message: 'Email or password is incorrect.' } }));
  expect(github.disabled).toBe(false);
  expect(switchMode.disabled).toBe(false);
  expect(screen.getByRole('alert').textContent).toBe('Email or password is incorrect.');
  expect(screen.getByLabelText<HTMLInputElement>(/^Email address/).value).toBe(initialValues.email);
  expect(screen.getByLabelText<HTMLInputElement>(/^Password/).value).toBe(initialValues.password);
  expect(callbacks.onSuccess).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  await waitFor(() => expect(callbacks.onSuccess).toHaveBeenCalledOnce());
});

it('explains disabled email access while leaving GitHub available', () => {
  const callbacks = props({ emailDisabled: true, notice: <AuthFeedback state="session-expired" /> });
  render(<AccountForm {...callbacks} />);
  expect(screen.getByRole<HTMLFieldSetElement>('group', { name: 'Sign in with email' }).disabled).toBe(true);
  expect(screen.getByRole('status').textContent).toContain('Email sign-in and registration are currently unavailable.');
  expect(screen.getByRole('alert', { name: 'Your session has expired' })).toBeTruthy();
  const github = screen.getByRole<HTMLButtonElement>('button', { name: 'Continue with GitHub' });
  expect(github.disabled).toBe(false);
  fireEvent.click(github);
  expect(callbacks.onGitHub).toHaveBeenCalledOnce();
  expect(request).not.toHaveBeenCalled();
});

it('starts the switched form with its supplied values instead of carrying the previous password', () => {
  const callbacks = props({ initialValues });
  const { rerender } = render(<AccountForm {...callbacks} />);
  rerender(<AccountForm {...callbacks} mode="register" schema={registerSchema} initialValues={{ email: initialValues.email }} />);
  expect(screen.getByLabelText<HTMLInputElement>(/^Email address/).value).toBe(initialValues.email);
  expect(screen.getByLabelText<HTMLInputElement>(/^Password/).value).toBe('');
  expect(screen.getByLabelText<HTMLInputElement>(/^Display name/).value).toBe('');
  expect(screen.getByRole<HTMLFieldSetElement>('group', { name: 'Create an account with email' }).disabled).toBe(false);
});
