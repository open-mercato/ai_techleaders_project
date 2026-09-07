import { useId, type ComponentProps } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Checkbox } from './checkbox';
import { Label } from './label';

function CheckboxExample(args: ComponentProps<typeof Checkbox>) {
  const id = useId();
  return <div className="dm-control-row"><Checkbox {...args} id={id} /><Label htmlFor={id}>Include TypeScript</Label></div>;
}
const meta = { title: 'Primitives/Checkbox', component: Checkbox, tags: ['autodocs'], render: args => <CheckboxExample {...args} />,
  parameters: { docs: { description: { component: 'An independent on/off choice with checked and mixed states. Space toggles the focused control. Pair with a clickable label; use a group legend when several choices answer one question.' } } },
} satisfies Meta<typeof Checkbox>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Checked: Story = { args: { defaultChecked: true } };
export const Mixed: Story = { args: { defaultChecked: 'indeterminate' } };
export const Small: Story = { args: { size: 'sm', defaultChecked: true } };
export const Disabled: Story = { args: { disabled: true } };
export const DisabledChecked: Story = { args: { disabled: true, defaultChecked: true } };
export const Error: Story = { args: { 'aria-invalid': true }, render: args => <div><CheckboxExample {...args} aria-describedby="checkbox-example-error" /><p id="checkbox-example-error" className="dm-field-error">Choose at least one stack.</p></div> };
