import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { Input } from '../../components/ui/input';
import { Textarea } from '../../components/ui/textarea';
import { FormField } from './FormField';

const meta = {
  title: 'Backend/Forms/FormField', component: FormField, tags: ['autodocs'],
  args: { label: 'Display name', children: control => <Input {...control} placeholder="Your public name" /> },
  decorators: [Story => <div className="w-full max-w-md"><Story /></div>],
  parameters: { docs: { description: { component: 'Connects a field to its label, helper text and error message. Pass the supplied control props to an Input, Textarea or SelectTrigger.' } } },
} satisfies Meta<typeof FormField>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Required: Story = { args: { required: true, description: 'Visible to developers browsing mentors.' } };
export const Error: Story = { args: { label: 'Public work', required: true, description: 'Use a public URL.', error: 'Enter a complete URL.', children: control => <Input {...control} defaultValue="github.com/" /> } };
export const WrittenAnswer: Story = { args: { label: 'Your answer', description: 'Include the reasoning behind your recommendation.', children: control => <Textarea {...control} placeholder="Explain your recommendation…" /> } };

function CorrectableField() {
  const [value, setValue] = useState('');
  return <FormField label="Display name" required description="Visible on your profile." error={value.trim() ? undefined : 'Enter your name.'}>
    {control => <Input {...control} value={value} onChange={event => setValue(event.target.value)} />}
  </FormField>;
}
export const CorrectingAnError: Story = {
  render: () => <CorrectableField />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('alert')).toBeVisible();
    await userEvent.type(canvas.getByRole('textbox', { name: 'Display name' }), 'Ada');
    await expect(canvas.queryByRole('alert')).not.toBeInTheDocument();
  },
};
