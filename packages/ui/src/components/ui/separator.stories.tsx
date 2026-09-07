import type { Meta, StoryObj } from '@storybook/react-vite';
import { Separator } from './separator';
const meta = { title: 'Primitives/Separator', component: Separator, tags: ['autodocs'], parameters: { docs: { description: { component: 'A one-pixel boundary. Use decorative separators between visually grouped content; set decorative=false when the separation has document meaning.' } } } } satisfies Meta<typeof Separator>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Horizontal: Story = { render: () => <div className="grid w-80 gap-4 text-sm"><p>Session details</p><Separator /><p>Payment summary</p></div> };
export const Vertical: Story = { render: () => <div className="flex h-8 items-center gap-4 text-sm"><span>25 minutes</span><Separator orientation="vertical" /><span>Written answer</span></div> };
