import { useId, type ComponentProps } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Label } from './label';
import { Switch } from './switch';

function SwitchExample(args: ComponentProps<typeof Switch>) {
  const id = useId();
  return <div className="dm-control-row"><Switch {...args} id={id} /><Label htmlFor={id}>Show past sessions</Label></div>;
}
const meta = { title: 'Primitives/Switch', component: Switch, tags: ['autodocs'], render: args => <SwitchExample {...args} />,
  parameters: { docs: { description: { component: 'A setting that changes immediately. Space toggles it. The label describes the setting and remains the same in both states. For a choice submitted with a form, prefer Checkbox.' } } },
} satisfies Meta<typeof Switch>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Off: Story = {};
export const On: Story = { args: { defaultChecked: true } };
export const Compact: Story = { args: { size: 'sm', defaultChecked: true } };
export const DisabledOff: Story = { args: { disabled: true } };
export const DisabledOn: Story = { args: { disabled: true, defaultChecked: true } };
