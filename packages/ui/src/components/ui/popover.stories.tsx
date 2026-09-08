import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from './button';
import { Popover, PopoverAnchor, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger } from './popover';

const meta = {
  title: 'Primitives/Popover', component: PopoverContent, tags: ['autodocs'],
  args: { align: 'start', sideOffset: 8 },
  parameters: { docs: { description: { component: 'A 320 px contextual surface for interactive information. Compose Popover → Trigger + Content; an optional Anchor controls placement independently of the trigger. Link Content aria-labelledby/aria-describedby to Title and Description. Title renders h2. Content portals and restores focus on Escape. For explicit dismissal, control open through the root.' } } },
  render: args => <Popover><PopoverAnchor><PopoverTrigger asChild><Button variant="outline">About time zones</Button></PopoverTrigger></PopoverAnchor><PopoverContent {...args} aria-labelledby="time-zone-title" aria-describedby="time-zone-description">
    <PopoverHeader><PopoverTitle id="time-zone-title">Your selected time zone</PopoverTitle><PopoverDescription id="time-zone-description">The catalogue example displays Europe/Warsaw. Date and time fields should always identify their zone.</PopoverDescription></PopoverHeader>
    <p style={{ margin: 0, fontSize: 12, color: 'var(--dm-text-sub-600)' }}>Press Escape or click the trigger to close.</p>
  </PopoverContent></Popover>,
} satisfies Meta<typeof PopoverContent>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Information: Story = {};

function ControlledPreview() {
  const [open, setOpen] = useState(false);
  return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button variant="outline">Preview preferences</Button></PopoverTrigger><PopoverContent aria-labelledby="preview-title">
    <PopoverHeader><PopoverTitle id="preview-title">Local preview</PopoverTitle><PopoverDescription>Review how a contextual action appears in the current theme.</PopoverDescription></PopoverHeader>
    <Button onClick={() => setOpen(false)}>Done</Button>
  </PopoverContent></Popover>;
}
export const Controlled: Story = { render: () => <ControlledPreview /> };
