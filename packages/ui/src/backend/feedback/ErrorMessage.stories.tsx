import type { Meta, StoryObj } from '@storybook/react-vite';
import { ErrorMessage } from './ErrorMessage';

const meta = { title: 'Backend/Feedback/ErrorMessage', component: ErrorMessage, tags: ['autodocs'], args: { message: 'We could not load your sessions. Please try again.' } } satisfies Meta<typeof ErrorMessage>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const LongMessage: Story = { args: { message: 'We could not confirm the payment status. Wait for confirmation before trying again; a connection error does not tell us whether the payment succeeded.' } };
