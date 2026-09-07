import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../ui/button';
import { PaymentStatus, ConnectStatus, PayoutStatus } from './PaymentStatus';
const meta = {
  title: 'Product/Payments', component: PaymentStatus, tags: ['autodocs'], args: { state: 'pending', reference: 'DM-2026-0018', actions: <Button intent="neutral" appearance="stroke">Check payment status</Button> },
  parameters: { docs: { description: { component: 'Provider-confirmed payment states for #22/#34 and later Connect, transfer and refund patterns for #19/#24/#25/#33. A returned checkout URL is not payment proof. Components do not trigger payments or assume that a failed confirmation means nothing was charged. First-iteration payout policy remains a product dependency (Q19).' } } },
} satisfies Meta<typeof PaymentStatus>;
export default meta;
type Story = StoryObj<typeof meta>;
export const AwaitingConfirmation: Story = {};
export const Redirecting: Story = { args: { state: 'redirecting', actions: <Button disabled aria-busy="true">Opening checkout…</Button> } };
export const Confirmed: Story = { args: { state: 'confirmed', actions: <Button>View upcoming sessions</Button> } };
export const Failed: Story = { args: { state: 'failed' } };
export const Expired: Story = { args: { state: 'expired', actions: <Button>Choose another time</Button> } };
export const SlotTaken: Story = { args: { state: 'slot-taken', actions: <Button>Choose another time</Button> } };
export const RefundPending: Story = { args: { state: 'refund-pending', actions: undefined } };
export const Refunded: Story = { args: { state: 'refunded', actions: undefined } };
export const RefundFailed: Story = { args: { state: 'refund-failed', actions: <Button intent="neutral" appearance="stroke">Contact support</Button> } };
export const ConnectStates: Story = { render: () => <div className="dm-product-grid">{(['incomplete', 'pending', 'enabled', 'restricted'] as const).map(state => <ConnectStatus key={state} state={state} actions={state === 'incomplete' || state === 'restricted' ? <Button>Continue in Stripe</Button> : undefined} />)}</div> };
export const PayoutStates: Story = { render: () => <div className="dm-product-grid">{(['held', 'scheduled', 'transferred', 'failed'] as const).map(state => <PayoutStatus key={state} state={state} gross="EUR 80.00" fee="EUR 16.00" net="EUR 64.00" detail={state === 'held' ? 'Waiting for confirmation that the payout can be released.' : state === 'failed' ? 'Review the connected account requirements.' : 'Status provided by the payment service.'} actions={state === 'failed' ? <Button intent="neutral" appearance="stroke">View account requirements</Button> : undefined} />)}</div> };
