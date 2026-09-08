import type { Meta, StoryObj } from '@storybook/react-vite';
import { MetricSummary } from './MetricSummary';
import { LoadingMessage } from '../../backend/feedback/LoadingMessage';
import { ErrorMessage } from '../../backend/feedback/ErrorMessage';
import { EmptyState } from '../../backend/feedback/EmptyState';
const meta = {
  title: 'Product/Operator metrics', component: MetricSummary, tags: ['autodocs'],
  args: { period: '7–13 September 2026', updatedLabel: 'Updated 10:00 UTC', metrics: [
    { id: 'paid', label: 'Paid sessions this week', value: '12', context: 'Bookings with confirmed payment' },
    { id: 'lead', label: 'Median booking-to-start', value: '2.4 days', context: 'For confirmed bookings this week' },
    { id: 'declines', label: 'Note declines', value: '2', context: 'Declined note versions this week' },
  ] },
  parameters: { docs: { description: { component: 'Operator metrics for #14/#22/#29: paid sessions, median time from booking to session start, and declined notes. The application calculates values and sample boundaries. This component does not include sales, revenue, HR metrics or trend data. Loading, error and empty states use the shared feedback components.' } } },
} satisfies Meta<typeof MetricSummary>;
export default meta;
type Story = StoryObj<typeof meta>;
export const CurrentWeek: Story = {};
export const UnavailableValue: Story = { args: { metrics: [{ id: 'lead', label: 'Median booking-to-start', value: 'Unavailable', context: 'No eligible confirmed bookings in this period' }] } };
export const Loading: Story = { render: () => <LoadingMessage message="Loading session metrics…" /> };
export const Error: Story = { render: () => <ErrorMessage message="Session metrics could not be loaded. Try again shortly." /> };
export const Empty: Story = { render: () => <EmptyState title="No paid sessions in this period" description="Metrics will appear after a booking has a confirmed payment." /> };
