import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../ui/button';
import { EmptyState } from '../../backend/feedback/EmptyState';
import { MentorDirectory } from './MentorProfileCard';
import { MentorListingCard } from './MentorListingCard';

const meta = {
  title: 'Product/Mentors/Listing card',
  component: MentorListingCard,
  tags: ['autodocs'],
  args: {
    name: 'Alex Laurent',
    headline: 'Staff engineer: developer tooling',
    initials: 'AL',
    stacks: ['TypeScript', 'React'],
    price25: 'PLN 240',
    price50: 'PLN 420',
    nextAvailableAt: '2026-09-20T09:00:00.000Z',
    profileHref: '/m/alex-laurent',
  },
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'One mentor in the public list (#20). All people shown here are fictional. This is not `MentorProfileCard`: that card is the mentor\'s own and carries a draft/published status chip and no price. This one carries what a mentee comparing mentors reads — stacks, both session prices as separate neutral chips, and the next available time. It shows no rating, no score and no featured treatment, and the list around it has no search box.',
      },
    },
  },
} satisfies Meta<typeof MentorListingCard>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Bookable: Story = {};

export const NoUpcomingTime: Story = {
  args: { nextAvailableAt: null },
  parameters: {
    docs: {
      description: {
        story:
          'A mentor with no future slot is not listed by the real list, which filters them out. This state exists for a card rendered from a stale snapshot, so it states the fact rather than showing an empty gap.',
      },
    },
  },
};

export const LongContent: Story = {
  args: {
    name: 'Alexandra Kowalska-Laurent',
    headline: 'Principal engineer working across developer experience and distributed systems',
    initials: 'AK',
    stacks: ['TypeScript', 'React', 'Node.js', 'PostgreSQL', 'Distributed systems'],
    price25: 'PLN 1 200',
    price50: 'PLN 2 200',
  },
};

export const InTheDirectory: Story = {
  render: args => (
    <MentorDirectory
      stacks={['TypeScript', 'React', 'Python']}
      selectedStack="React"
      onStackChange={() => undefined}
      resultCount={2}
      empty={
        <EmptyState
          title="No mentors with this stack right now"
          description="Choose another stack or check back for new availability."
          action={<Button intent="neutral" appearance="stroke">Clear filter</Button>}
        />
      }
    >
      <MentorListingCard {...args} />
      <MentorListingCard
        {...args}
        name="Priya Raman"
        initials="PR"
        headline="Senior engineer: Python and data platforms"
        stacks={['Python', 'React']}
        price25="PLN 180"
        price50="PLN 320"
        nextAvailableAt="2026-09-22T15:30:00.000Z"
        profileHref="/m/priya-raman"
      />
    </MentorDirectory>
  ),
  parameters: {
    docs: {
      description: {
        story:
          'The card inside the existing directory shell. The shell owns the stack filter, the result count and the empty state; the order is the host\'s, which sorts by most recently published availability.',
      },
    },
  },
};
