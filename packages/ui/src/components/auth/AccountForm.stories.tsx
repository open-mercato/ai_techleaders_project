import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { delay, http, HttpResponse } from 'msw';
import { z } from 'zod';
import { AuthLayout } from '../../backend/shell/AuthLayout';
import { Button } from '../ui/button';
import { AccountForm, type AccountFormProps } from './AccountForm';
import { AuthFeedback } from './AuthFeedback';

const signInSchema = z.object({ email: z.email('Enter a valid email address.'), password: z.string().min(1, 'Enter your password.') });
const registerSchema = signInSchema.extend({
  displayName: z.string().trim().min(1, 'Enter your display name.'),
  password: z.string().min(12, 'Use at least 12 characters.').refine(value => new TextEncoder().encode(value).length <= 72, 'This password is too long. Use fewer characters.'),
});
const initialValues = { email: 'jordan@example.test', password: 'example-password' };
const endpoint = (scenario: string) => `/storybook-api/account/${scenario}`;
const handlers = [
  http.post(endpoint('pending'), async () => { await delay(2500); return HttpResponse.json({ ok: true, data: { id: 'fictional-account' } }); }),
  http.post(endpoint('invalid'), () => HttpResponse.json({ ok: false, error: { code: 'invalid_credentials', message: 'Email or password is incorrect. Check your details and try again.' } }, { status: 401 })),
  http.post(endpoint('duplicate'), () => HttpResponse.json({ ok: false, error: { code: 'account_exists', message: 'An account already uses this email. Sign in to continue.' } }, { status: 409 })),
  http.post(endpoint('unavailable'), () => HttpResponse.json({ ok: false, error: { code: 'unavailable', message: 'We could not complete the request. Try again; your entries are still here.' } }, { status: 503 })),
  http.post('/storybook-api/account/:scenario', () => HttpResponse.json({ ok: true, data: { id: 'fictional-account' } })),
];

function AccountExample(args: AccountFormProps) {
  const [notice, setNotice] = useState<string | null>(null);
  return <AuthLayout title={args.mode === 'register' ? 'Create your account' : 'Welcome back'}
    description={args.mode === 'register' ? 'Book text sessions with a mentor and keep your written answers in one place.' : 'Sign in to see your sessions, written answers and private notes.'}
    footer={<Button intent="neutral" appearance="ghost" onClick={fn()}>Back to home</Button>}>
    <AccountForm {...args}
      onSuccess={data => { setNotice(args.mode === 'register' ? 'This example accepted your registration. The next step is email verification.' : 'This example accepted your sign-in details.'); args.onSuccess(data); }}
      onGitHub={() => { setNotice('The host would start GitHub sign-in here. This example stays in Storybook.'); args.onGitHub(); }}
      onSwitchMode={() => { setNotice(args.mode === 'register' ? 'Open the Sign in example to try that form.' : 'Open the Registration example to try that form.'); args.onSwitchMode(); }} />
    {notice && <p className="dm-product-callout" role="status">{notice}</p>}
  </AuthLayout>;
}

const meta = {
  title: 'Product/Account form', component: AccountForm, tags: ['autodocs'],
  args: { mode: 'sign-in', schema: signInSchema, endpoint: endpoint('sign-in'), onSuccess: fn(), onGitHub: fn(), onSwitchMode: fn() },
  render: args => <AccountExample {...args} />,
  parameters: {
    layout: 'fullscreen', msw: { handlers },
    controls: { exclude: ['schema', 'endpoint', 'initialValues', 'notice'] },
    docs: { description: { component: 'GitHub and email account forms for E01 (#12 and #13). The host supplies validation schemas, endpoints, notices and navigation. CrudForm handles validation, pending requests and errors through apiCall. Stories use fictional accounts and local mock responses; they do not create accounts, send email or contact GitHub. Password requirements are enforced by the supplied schema.' } },
  },
} satisfies Meta<typeof AccountForm>;
export default meta;
type Story = StoryObj<typeof meta>;

export const SignIn: Story = {};
export const Registration: Story = { args: { mode: 'register', schema: registerSchema, endpoint: endpoint('register') } };
export const EmailDisabled: Story = { args: { emailDisabled: true } };
export const UnverifiedEmail: Story = { args: { notice: <AuthFeedback state="unverified-email" actions={<Button intent="neutral" appearance="stroke" onClick={fn()}>Resend verification email</Button>} /> } };
export const SessionExpired: Story = { args: { notice: <AuthFeedback state="session-expired" /> } };
export const ClientValidation: Story = {
  args: { mode: 'register', schema: registerSchema, endpoint: endpoint('validation') },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Create account' }));
    await expect(canvas.getByRole('textbox', { name: 'Display name' })).toHaveFocus();
    await expect(canvas.getByText('Enter your display name.')).toBeVisible();
  },
};
export const Submitting: Story = {
  args: { initialValues, endpoint: endpoint('pending') },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Sign in' }));
    await expect(canvas.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    await expect(canvas.getByRole('button', { name: 'Continue with GitHub' })).toBeDisabled();
    await expect(canvas.getByRole('button', { name: 'Create account' })).toBeDisabled();
  },
};
export const Success: Story = {
  args: { initialValues, endpoint: endpoint('success') },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Sign in' }));
    await expect(await canvas.findByRole('status')).toHaveTextContent('This example accepted your sign-in details.');
    await expect(args.onSuccess).toHaveBeenCalled();
  },
};
export const InvalidCredentials: Story = {
  args: { initialValues, endpoint: endpoint('invalid') },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Sign in' }));
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Email or password is incorrect.');
    await expect(canvas.getByLabelText(/^Password/)).toHaveValue(initialValues.password);
  },
};
export const ExistingAccount: Story = {
  args: { mode: 'register', schema: registerSchema, initialValues: { ...initialValues, displayName: 'Jordan Lee' }, endpoint: endpoint('duplicate') },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Create account' }));
    await expect(await canvas.findByRole('alert')).toHaveTextContent('An account already uses this email.');
  },
};
export const ServiceUnavailable: Story = {
  args: { initialValues, endpoint: endpoint('unavailable') },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Sign in' }));
    await expect(await canvas.findByRole('alert')).toHaveTextContent('your entries are still here.');
  },
};
export const Mobile: Story = { ...Registration, globals: { viewport: { value: 'mobile1', isRotated: false } } };
