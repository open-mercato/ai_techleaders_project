import { useId, type ComponentProps } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Label } from './label';
import { RadioGroup, RadioGroupItem } from './radio-group';

function DurationOptions(args: ComponentProps<typeof RadioGroup>) {
  const id = useId();
  return <fieldset style={{ border: 0, padding: 0 }}><legend className="dm-field-label" style={{ marginBottom: 8 }}>Session length</legend>
    <RadioGroup {...args} aria-label="Session length">
      <div className="dm-control-row"><RadioGroupItem id={`${id}-25`} value="25" /><Label htmlFor={`${id}-25`}>25 minutes</Label></div>
      <div className="dm-control-row"><RadioGroupItem id={`${id}-50`} value="50" /><Label htmlFor={`${id}-50`}>50 minutes</Label></div>
    </RadioGroup>
  </fieldset>;
}
const meta = { title: 'Primitives/Radio group', component: RadioGroup, tags: ['autodocs'], render: args => <DurationOptions {...args} />,
  parameters: { docs: { description: { component: 'Choose one option in a named group. Tab enters the group; arrow keys move and select. Use the same group for 25/50-minute session choices rather than independent checkboxes.' } } },
} satisfies Meta<typeof RadioGroup>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Selected: Story = { args: { defaultValue: '25' } };
export const Disabled: Story = { args: { disabled: true, defaultValue: '50' } };
export const Horizontal: Story = { args: { defaultValue: '25', orientation: 'horizontal', style: { display: 'flex', gap: 24, flexWrap: 'wrap' } } };
export const Error: Story = { args: { 'aria-invalid': true }, render: args => <div><DurationOptions {...args} aria-describedby="duration-example-error" /><p id="duration-example-error" className="dm-field-error">Choose a session length.</p></div> };
