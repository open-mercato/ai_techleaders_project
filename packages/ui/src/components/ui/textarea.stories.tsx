import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { FormField } from '../../backend/forms/FormField';
import { Textarea } from './textarea';

const meta = {
  title: 'Primitives/Textarea', component: Textarea, tags: ['autodocs'],
  args: { placeholder: 'Describe the problems you can help developers solve.', rows: 4 },
  render: args => <div style={{ width: 'min(100%, 400px)' }}><FormField label="Mentor introduction" description="Be specific about your experience.">{control => <Textarea {...args} {...control} />}</FormField></div>,
  parameters: { docs: { description: { component: 'A resizable, multiline native field with a 12 px radius. Associate labels and errors using FormField. Length limits come from the feature schema.' } } },
} satisfies Meta<typeof Textarea>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Filled: Story = { args: { defaultValue: 'I help teams diagnose tricky React rendering bugs and design maintainable TypeScript APIs.' } };
export const Disabled: Story = { args: { disabled: true, defaultValue: 'This introduction is being saved.' } };
export const Error: Story = { render: args => <FormField label="Reason for declining" required error="Add a comment so your mentor can revise the note.">{control => <Textarea {...args} {...control} placeholder="Explain what needs to change." />}</FormField> };
function CountedTextarea() {
  const [value, setValue] = useState('');
  return <FormField label="Short introduction" description={`${value.length} of 200 characters`}>
    {control => <Textarea {...control} maxLength={200} value={value} onChange={event => setValue(event.target.value)} />}
  </FormField>;
}
export const CharacterCount: Story = { render: () => <CountedTextarea /> };
