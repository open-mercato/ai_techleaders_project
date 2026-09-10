import type { Meta, StoryObj } from '@storybook/react-vite';
import { MentorPageView } from './MentorPageView';

const meta = {
  title: 'Product/Mentor page',
  component: MentorPageView,
  tags: ['autodocs'],
  parameters: { layout: 'fullscreen' },
  decorators: [(Story) => <main className="min-h-screen bg-slate-50 px-4 py-10 dark:bg-slate-950"><Story /></main>],
  args: {
    profile: {
      displayName: 'Alex Laurent',
      publicWorkUrl: 'https://example.com/alex/work',
      bio: 'I help developers work through TypeScript API problems, decide what to test and make their code easier to change.',
      stackTags: ['TypeScript', 'React', 'AI agents'],
    },
  },
} satisfies Meta<typeof MentorPageView>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Published: Story = {};
