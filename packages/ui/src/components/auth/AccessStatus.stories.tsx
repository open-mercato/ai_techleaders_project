import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../ui/button';
import { AccessStatus } from './AccessStatus';
const meta = {
  title: 'Product/Account access', component: AccessStatus, tags: ['autodocs'],
  args: { state: 'check-inbox', detail: 'Verification sent to jamie@example.com.', actions: <Button intent="neutral" appearance="stroke">Resend verification email</Button> },
  parameters: { docs: { description: { component: 'Recovery and invitation states for #12 to #15. This composition displays server state and authorized actions; it performs no authentication, access checks or invitation acceptance. Deadlines are supplied by the caller.' } } },
} satisfies Meta<typeof AccessStatus>;
export default meta;
type Story = StoryObj<typeof meta>;
export const CheckInbox: Story = {};
export const Verified: Story = { args: { state: 'verified', detail: undefined, actions: <Button>Continue to sessions</Button> } };
export const SessionExpired: Story = { args: { state: 'session-expired', detail: undefined, actions: <Button>Sign in again</Button> } };
export const NoAccess: Story = { args: { state: 'forbidden', detail: undefined, actions: <Button intent="neutral" appearance="stroke">Go to my sessions</Button> } };
export const OAuthCancelled: Story = { args: { state: 'oauth-cancelled', detail: undefined, actions: <><Button intent="neutral" appearance="stroke">Continue with GitHub</Button><Button>Use email</Button></> } };
export const MethodUnavailable: Story = { args: { state: 'method-unavailable', detail: undefined, actions: <Button>Use email instead</Button> } };
export const InvitationAccepted: Story = { args: { state: 'invitation-accepted', detail: 'Publish your first bookable session by 21 September 2026, within 14 days of accepting.', actions: <Button>Complete mentor profile</Button> } };
export const InvitationInvalid: Story = { args: { state: 'invitation-invalid', detail: undefined, actions: <Button intent="neutral" appearance="stroke">Contact the sender</Button> } };
export const InvitationExpired: Story = { args: { state: 'invitation-expired', detail: undefined, actions: <Button intent="neutral" appearance="stroke">Request a new invitation</Button> } };
export const InvitationUsed: Story = { args: { state: 'invitation-used', detail: undefined, actions: <Button>Sign in</Button> } };
