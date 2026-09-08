import { useId, type ComponentProps } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { FormField } from '../../backend/forms/FormField';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from './select';

function StackSelect({ size = 'default', disabled, error, defaultValue }: {
  size?: ComponentProps<typeof SelectTrigger>['size']; disabled?: boolean; error?: string; defaultValue?: string;
}) {
  const id = useId();
  return <div style={{ width: 'min(100%, 360px)' }}><FormField label="Stack" id={id} description="Choose one topic for this example." error={error}>
    {control => <Select defaultValue={defaultValue} disabled={disabled}>
      <SelectTrigger {...control} size={size}><SelectValue placeholder="Choose a stack" /></SelectTrigger>
      <SelectContent position="popper">
        <SelectGroup><SelectLabel>Languages</SelectLabel><SelectItem value="typescript">TypeScript</SelectItem><SelectItem value="python">Python</SelectItem></SelectGroup>
        <SelectSeparator />
        <SelectGroup><SelectLabel>Frameworks and tools</SelectLabel><SelectItem value="react">React</SelectItem><SelectItem value="ai-agents">AI agents</SelectItem></SelectGroup>
      </SelectContent>
    </Select>}
  </FormField></div>;
}
const meta = { title: 'Primitives/Select', component: StackSelect, tags: ['autodocs'],
  parameters: { docs: { description: { component: 'A single-choice popup built with Select, Trigger, Value, Content, Group and Item. Keyboard arrows navigate, typing finds an option, Enter chooses and Escape closes. For multiple mentor stack tags, use a labeled checkbox group.' } } },
} satisfies Meta<typeof StackSelect>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Selected: Story = { args: { defaultValue: 'react' } };
export const Small: Story = { args: { size: 'sm' } };
export const Compact: Story = { args: { size: 'xs' } };
export const Disabled: Story = { args: { disabled: true, defaultValue: 'typescript' } };
export const Error: Story = { args: { error: 'Choose a stack before continuing.' } };

export const KeyboardInteraction: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole('combobox', { name: 'Stack' });
    trigger.focus();
    await userEvent.keyboard('{ArrowDown}');
    await expect(await page.findByRole('option', { name: 'TypeScript' })).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}{Enter}');
    await expect(trigger).toHaveTextContent('Python');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(trigger).toHaveFocus();
    await userEvent.keyboard('{ArrowDown}{Escape}');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(trigger).toHaveFocus();
  },
};
