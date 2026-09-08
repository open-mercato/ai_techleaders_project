import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { Button } from '../ui/button';
import { AuthFeedback } from './AuthFeedback';

const retry = <Button intent="neutral" appearance="stroke" onClick={fn()}>Try again</Button>;
const github = <Button intent="neutral" appearance="stroke" onClick={fn()}>Continue with GitHub</Button>;
const verify = <Button intent="neutral" appearance="stroke" onClick={fn()}>Resend verification email</Button>;
const signIn = <Button onClick={fn()}>Sign in</Button>;
const home = <Button intent="neutral" appearance="stroke" onClick={fn()}>Go to my account</Button>;

const meta = {
  title: 'Product/Authentication feedback', component: AuthFeedback, tags: ['autodocs'],
  args: { state: 'check-inbox', detail: 'Sent to jordan@example.test.', actions: verify },
  parameters: { docs: { description: { component: 'Compact feedback for E01 authentication and access outcomes (#12 to #14). Error states use an alert; completed actions and information use a status. The host provides the confirmed state, destination or retry time, and working recovery callbacks. Story actions are recorded in the interaction panel; they do not contact authentication services.' } } },
  decorators: [Story => <div style={{ width: '100%', maxWidth: 460 }}><Story /></div>],
} satisfies Meta<typeof AuthFeedback>;
export default meta;
type Story = StoryObj<typeof meta>;

export const CheckInbox: Story = {};
export const Verified: Story = { args: { state: 'verified', detail: undefined, actions: <Button onClick={fn()}>Continue to my account</Button> } };
export const InvalidCredentials: Story = { args: { state: 'invalid-credentials', detail: undefined, actions: undefined } };
export const UnverifiedEmail: Story = { args: { state: 'unverified-email', detail: undefined } };
export const GitHubAccount: Story = { args: { state: 'github-account', detail: undefined, actions: github } };
export const AccountExists: Story = { args: { state: 'account-exists', detail: undefined, actions: signIn } };
export const GitHubCancelled: Story = { args: { state: 'github-cancelled', detail: undefined, actions: github } };
export const GitHubState: Story = { args: { state: 'github-state', detail: undefined, actions: github } };
export const GitHubUnavailable: Story = { args: { state: 'github-unavailable', detail: undefined, actions: github } };
export const GitHubEmail: Story = { args: { state: 'github-email', detail: undefined, actions: github } };
export const GitHubLink: Story = { args: { state: 'github-link', detail: undefined, actions: verify } };
export const RateLimited: Story = { args: { state: 'rate-limited', detail: 'You can request another email in 30 seconds.', actions: <Button intent="neutral" appearance="stroke" disabled>Resend available in 30 seconds</Button> } };
export const ServiceUnavailable: Story = { args: { state: 'service-unavailable', detail: undefined, actions: retry } };
export const MailUnavailable: Story = { args: { state: 'mail-unavailable', detail: undefined, actions: verify } };
export const SessionExpired: Story = { args: { state: 'session-expired', detail: undefined, actions: signIn } };
export const Forbidden: Story = { args: { state: 'forbidden', detail: undefined, actions: home } };
export const SignedOut: Story = { args: { state: 'signed-out', detail: undefined, actions: signIn } };
export const VerificationExpired: Story = { args: { state: 'verification-expired', detail: undefined, actions: verify } };
export const VerificationInvalid: Story = { args: { state: 'verification-invalid', detail: undefined, actions: verify } };
export const OperatorRevoked: Story = { args: { state: 'operator-revoked', detail: undefined, actions: home } };
