import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../ui/button';
import { BookingSummary, CancellationSummary } from './BookingSummary';
const meta = {
  title: 'Product/Booking', component: BookingSummary, tags: ['autodocs'],
  args: { mentorName: 'Alex Laurent', startsAt: '2026-09-09T12:00:00Z', dateLabel: 'Wednesday, 9 September 2026', timeLabel: '14:00–14:25', timeZone: 'Europe/Warsaw', duration: 25, total: 'EUR 45.00', actions: <><Button intent="neutral" appearance="ghost">Change time</Button><Button>Continue to secure checkout</Button></> },
  parameters: { docs: { description: { component: 'Booking summary for #21/#22/#34. Prices, timezone and reservation state are input data. Stripe Checkout collects payment information; this component never collects card details. CancellationSummary supports later #24 and takes the server-calculated financial consequence without implementing policy.' } } },
} satisfies Meta<typeof BookingSummary>;
export default meta;
type Story = StoryObj<typeof meta>;
export const ReadyForCheckout: Story = {};
export const FiftyMinutes: Story = { args: { duration: 50, timeLabel: '14:00–14:50', total: 'EUR 80.00' } };
export const Reserved: Story = { args: { notice: 'This time is reserved until 13:30 UTC while you complete checkout.' } };
export const RefreshingAvailability: Story = { args: { notice: 'Checking that your selected time is still available…', actions: <Button disabled aria-busy="true">Checking availability…</Button> } };
export const LongDetails: Story = { args: { mentorName: 'Alexandra Kowalska-Laurent', timeZone: 'America/Argentina/Buenos_Aires', timeLabel: '09:00–09:25', total: 'ARS 125,000.00' } };
export const FreeCancellation: Story = { render: () => <CancellationSummary sessionLabel="9 September, 14:00: Europe/Warsaw" paid="EUR 45.00" refund="EUR 45.00" consequence="Your session starts in more than 24 hours. The session fee will be refunded if you cancel." actions={<><Button intent="neutral" appearance="ghost">Keep booking</Button><Button intent="error" appearance="stroke">Review cancellation</Button></>} /> };
export const LateCancellation: Story = { render: () => <CancellationSummary sessionLabel="9 September, 14:00: Europe/Warsaw" paid="EUR 45.00" refund="EUR 0.00" consequence="Your session starts in less than 24 hours. Cancelling now forfeits the session fee." actions={<><Button intent="neutral" appearance="ghost">Keep booking</Button><Button intent="error" appearance="stroke">Review cancellation</Button></>} /> };
