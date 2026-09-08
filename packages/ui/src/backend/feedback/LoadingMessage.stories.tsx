import type { Meta, StoryObj } from '@storybook/react-vite';
import { LoadingMessage } from './LoadingMessage';

const meta = { title: 'Backend/Feedback/LoadingMessage', component: LoadingMessage, tags: ['autodocs'] } satisfies Meta<typeof LoadingMessage>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Sessions: Story = { args: { message: 'Loading your upcoming sessions…' } };
