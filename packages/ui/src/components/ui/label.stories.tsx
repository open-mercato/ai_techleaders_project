import { useId } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { FormField } from '../../backend/forms/FormField';
import { Input } from './input';
import { Label } from './label';

function LabeledInput() {
  const id = useId();
  return <div className="dm-field"><Label htmlFor={id}>Display name</Label><Input id={id} placeholder="Alex Laurent" /></div>;
}
const meta = { title: 'Primitives/Label', component: Label, tags: ['autodocs'],
  parameters: { docs: { description: { component: 'A visible control label. Match htmlFor to a unique control ID. FormField provides this association, required indication, descriptions and linked errors automatically.' } } },
} satisfies Meta<typeof Label>;
export default meta;
type Story = StoryObj<typeof meta>;
export const WithInput: Story = { render: () => <LabeledInput /> };
export const Required: Story = { render: () => <FormField label="Public work link" required description="Share a repository, article or other public work.">{control => <Input {...control} type="url" placeholder="https://github.com/…" />}</FormField> };
export const Optional: Story = { render: () => <FormField label="Headline (optional)">{control => <Input {...control} />}</FormField> };
