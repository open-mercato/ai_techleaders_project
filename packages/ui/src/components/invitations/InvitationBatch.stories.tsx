import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../ui/button';
import { InvitationBatch } from './InvitationBatch';
const meta = {
  title: 'Product/Invitation batches', component: InvitationBatch, tags: ['autodocs'],
  args: { label: 'September mentor batch', sent: 4, capacity: 20, state: 'open', invitations: [
    { id: '1', name: 'Alex Laurent', email: 'alex@example.com', status: 'published', deadline: '18 September' },
    { id: '2', name: 'Samira Chen', email: 'samira@example.com', status: 'accepted', deadline: '21 September' },
    { id: '3', name: 'Oliver Kowalski', email: 'oliver@example.com', status: 'invited', deadline: 'Awaiting acceptance' },
    { id: '4', name: 'Morgan Hayes', email: 'morgan@example.com', status: 'overdue', deadline: '6 September' },
  ], actions: <Button>Invite mentor</Button> },
  parameters: { docs: { description: { component: 'Later 1.1 operator pattern for #30. Reuses the shared DataTable; shows batch progress, acceptance and first availability deadlines. Batch capacity and eligibility are supplied by the application; actions never send invitations in the catalogue.' } } },
} satisfies Meta<typeof InvitationBatch>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Progress: Story = {};
export const Full: Story = { args: { sent: 20, state: 'full', actions: <Button disabled>Batch is full</Button> } };
export const Stopped: Story = { args: { state: 'stopped', actions: <p className="dm-product-muted">This batch is closed to new invitations.</p> } };
export const Empty: Story = { args: { sent: 0, invitations: [] } };
