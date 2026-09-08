import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { Button } from '../../components/ui/button';
import { EmptyState } from './EmptyState';

const meta = { title: 'Backend/Feedback/EmptyState', component: EmptyState, tags: ['autodocs'], args: { title: 'No sessions yet' } } satisfies Meta<typeof EmptyState>;
export default meta;
type Story = StoryObj<typeof meta>;
export const TitleOnly: Story = {};
export const WithDescription: Story = { args: { description: 'Your confirmed sessions will appear here after booking.' } };
export const MentorAvailability: Story = {
  args: { title: 'No slots published', description: 'Add your first available time so a mentee can book a text session.', action: <Button onClick={fn()}>Add a slot</Button> },
};
export const MenteeAvailability: Story = { args: { title: 'No available slots', description: 'This mentor has no published availability. Check their profile again later.' } };
