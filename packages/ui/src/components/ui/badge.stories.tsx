import type { Meta, StoryObj } from '@storybook/react-vite';
import { Badge } from './badge';
const meta = { title: 'Primitives/Badge', component: Badge, tags: ['autodocs'], args: { children: 'Pending' }, parameters: { docs: { description: { component: 'Compact status and category labels. Always include meaningful text; color supplements the label. Sizes are 16, 20 and 24 pixels.' } } } } satisfies Meta<typeof Badge>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default: Story = {};
export const Statuses: Story = { render: () => <div className="flex flex-wrap gap-3"><Badge variant="secondary">Draft</Badge><Badge variant="warning">Pending</Badge><Badge variant="success">Paid</Badge><Badge variant="destructive">Failed</Badge><Badge variant="information">New answer</Badge><Badge variant="outline">Written session</Badge></div> };
export const Sizes: Story = { render: () => <div className="flex items-center gap-3"><Badge size="sm">Pending</Badge><Badge>Pending</Badge><Badge size="lg">Pending</Badge></div> };
export const TextOnly: Story = { args: { variant: 'ghost', children: 'React' } };
