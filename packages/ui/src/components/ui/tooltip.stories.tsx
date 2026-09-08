import type { Meta, StoryObj } from '@storybook/react-vite';
import { Info } from 'lucide-react';
import { Button } from './button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './tooltip';

const meta = {
  title: 'Primitives/Tooltip', component: TooltipContent, tags: ['autodocs'],
  args: { side: 'top', sideOffset: 6 },
  argTypes: { side: { control: 'select', options: ['top', 'right', 'bottom', 'left'] } },
  parameters: { docs: { description: { component: 'Supplementary, noninteractive information on hover or keyboard focus. Compose Provider → Tooltip → Trigger + Content. Give icon-only triggers their own accessible name; a tooltip must not be the only place for essential instructions. Use Popover for links, controls or persistent content. Provider delayDuration is configurable; the default is immediate.' } } },
  render: args => <TooltipProvider><Tooltip><TooltipTrigger asChild><Button variant="ghost" iconOnly aria-label="About private session notes"><Info aria-hidden="true" /></Button></TooltipTrigger><TooltipContent {...args}>Notes are private to their author.</TooltipContent></Tooltip></TooltipProvider>,
} satisfies Meta<typeof TooltipContent>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Open: Story = {
  render: args => <TooltipProvider><Tooltip open><TooltipTrigger asChild><Button variant="outline">Private notes</Button></TooltipTrigger><TooltipContent {...args}>Visible to the author only</TooltipContent></Tooltip></TooltipProvider>,
};
export const Delayed: Story = {
  render: args => <TooltipProvider delayDuration={400}><Tooltip><TooltipTrigger asChild><Button variant="outline">Hover or focus</Button></TooltipTrigger><TooltipContent {...args}>Pointer hover waits 400 ms; keyboard focus opens immediately.</TooltipContent></Tooltip></TooltipProvider>,
};
