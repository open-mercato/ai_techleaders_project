import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../../components/ui/button';
import { ReadinessChecklist } from './ReadinessChecklist';

const meta = {
  title: 'Platform/Feedback/Readiness checklist',
  component: ReadinessChecklist,
  tags: ['autodocs'],
  args: {
    items: [
      { key: 'publicWorkUrl', label: 'Add a link to your public work', met: true },
      { key: 'bio', label: 'Describe the work you have done', met: false },
      { key: 'stackTags', label: 'Choose at least one technology', met: false },
    ],
    actionsByKey: {
      bio: <Button type="button" variant="outline">Add bio</Button>,
    },
  },
} satisfies Meta<typeof ReadinessChecklist>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ProfileDraft: Story = {};
