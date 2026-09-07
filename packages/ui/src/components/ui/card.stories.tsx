import type { Meta, StoryObj } from '@storybook/react-vite';
import { fn } from 'storybook/test';
import { Button } from './button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from './card';

const meta = {
  title: 'Primitives/Card', component: Card, tags: ['autodocs'],
  parameters: { docs: { description: { component: 'A container for related content. Compose CardTitle with asChild and a meaningful heading level. Use its header, content and footer slots; make actions explicit.' } } },
} satisfies Meta<typeof Card>;
export default meta;
type Story = StoryObj<typeof meta>;
const viewSession = fn();

export const Session: Story = {
  render: args => <Card {...args} className="w-full max-w-md"><CardHeader><CardDescription>Upcoming text session</CardDescription><CardTitle asChild><h2>Working through React state</h2></CardTitle></CardHeader><CardContent><p className="text-sm">Alex Laurent: 25 minutes</p><p className="mt-2 text-sm text-muted-foreground">8 October 2026: 14:00 Europe/Warsaw</p><p className="mt-4 text-sm">Text only. No audio or video.</p></CardContent><CardFooter><Button variant="outline" onClick={viewSession}>View session</Button></CardFooter></Card>,
};
export const ContentOnly: Story = {
  render: args => <Card {...args} className="max-w-md"><CardContent className="pt-6"><p>Keep related information together in a card.</p></CardContent></Card>,
};
export const LongContent: Story = {
  render: args => <Card {...args} className="max-w-sm"><CardHeader><CardTitle asChild><h2>Tracing a TypeScript generic constraint through a deeply nested React component</h2></CardTitle><CardDescription>A deliberately long title and description to inspect wrapping on narrower screens.</CardDescription></CardHeader><CardContent><p className="text-sm">Keep supporting details readable without making the whole card an ambiguous click target.</p></CardContent></Card>,
};
