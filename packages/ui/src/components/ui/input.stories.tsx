import type { Meta, StoryObj } from '@storybook/react-vite';
import { FormField } from '../../backend/forms/FormField';
import { Input } from './input';

const meta = {
  title: 'Primitives/Input', component: Input, tags: ['autodocs'],
  args: { placeholder: 'alex@example.com', type: 'email', fieldSize: 'md' },
  render: args => <div style={{ width: 'min(100%, 360px)' }}><FormField label="Email address" description="Use the address associated with your account.">{control => <Input {...args} {...control} />}</FormField></div>,
  parameters: { docs: { description: { component: 'A native input with 40, 36 and 32 px densities. Use FormField for a visible label and linked helper/error text. The native size prop remains available; fieldSize controls visual density.' } } },
} satisfies Meta<typeof Input>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Filled: Story = { args: { defaultValue: 'alex@example.com' } };
export const Small: Story = { args: { fieldSize: 'sm' } };
export const Compact: Story = { args: { fieldSize: 'xs' } };
export const Disabled: Story = { args: { disabled: true, defaultValue: 'alex@example.com' } };
export const ReadOnly: Story = { args: { readOnly: true, defaultValue: 'alex@example.com' } };
export const Password: Story = { args: { type: 'password', placeholder: 'Enter your password' }, render: args => <FormField label="Password" required>{control => <Input {...args} {...control} autoComplete="current-password" />}</FormField> };
export const Error: Story = { render: args => <FormField label="Email address" error="Enter a valid email address." required>{control => <Input {...args} {...control} defaultValue="alex@" />}</FormField> };
