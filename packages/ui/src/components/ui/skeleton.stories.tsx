import type { Meta, StoryObj } from '@storybook/react-vite';
import { Skeleton } from './skeleton';
const meta = { title: 'Primitives/Skeleton', component: Skeleton, tags: ['autodocs'], args: { className:'h-5 w-48' }, parameters: { docs: { description: { component: 'A visual placeholder for content being loaded. Hidden from assistive technology; announce loading once on the surrounding region. Respects reduced motion.' } } } } satisfies Meta<typeof Skeleton>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Text: Story = {};
export const Mentor: Story = { render: () => <div role="status" aria-label="Loading mentor profile" className="flex w-80 gap-4"><Skeleton className="h-10 w-10 shrink-0 rounded-full" /><div className="grid flex-1 gap-3"><Skeleton className="h-5 w-32" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-40" /></div></div> };
export const SessionList: Story = { render: () => <div role="status" aria-label="Loading sessions" className="grid w-full max-w-lg gap-4">{[1,2,3].map(key=><Skeleton key={key} className="h-20 w-full" />)}</div> };
