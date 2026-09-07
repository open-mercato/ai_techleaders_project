import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../ui/button';
import { SessionCard, SessionHeader, NotificationItem } from './SessionCard';
const meta = {
  title: 'Product/Sessions', component: SessionCard, tags: ['autodocs'],
  args: { title: 'A clearer boundary for your TypeScript API', participant: 'Alex Laurent', startsAt: '2026-09-09T12:00:00Z', dateLabel: 'Wednesday, 9 September: 14:00', timeZone: 'Europe/Warsaw', duration: 25, state: 'upcoming', actions: <Button intent="neutral" appearance="stroke">View session</Button> },
  parameters: { docs: { description: { component: 'Session cards, header and notification for #23/#26. Every booking/session view states the text format. Session state, allowed navigation and channel access come from the application. No channel is chosen by this component (Q18).' } } },
} satisfies Meta<typeof SessionCard>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Upcoming: Story = {};
export const InProgress: Story = { args: { state: 'open', actions: <Button>Open text session</Button> } };
export const Past: Story = { args: { state: 'ended', actions: <Button intent="neutral" appearance="stroke">Read written answer</Button> } };
export const Cancelled: Story = { args: { state: 'cancelled', actions: <Button intent="neutral" appearance="stroke">View cancellation</Button> } };
export const Header: Story = { render: () => <SessionHeader title="A clearer boundary for your TypeScript API" state="open" participants="Alex Laurent and Jamie Chen" schedule="14:00–14:25 Europe/Warsaw" notice="This is a text session. Keep your question and relevant context in the agreed session channel." actions={<Button intent="neutral" appearance="stroke">Session details</Button>} /> };
function NotificationsExample() {
  const [read, setRead] = useState(false);
  return <div className="dm-product-stack"><NotificationItem title="Your text session is confirmed" description="Alex Laurent: Wednesday, 9 September at 14:00 Europe/Warsaw" createdAt="2026-09-07T10:00:00Z" timeLabel="Just now" href="#session" read={read} onMarkRead={() => setRead(true)} /><NotificationItem title="Your written answer is ready" description="Read the answer from your session about API boundaries." createdAt="2026-09-06T15:30:00Z" timeLabel="Yesterday" href="#answer" read onMarkRead={() => undefined} /></div>;
}
export const Notifications: Story = { render: () => <NotificationsExample /> };
