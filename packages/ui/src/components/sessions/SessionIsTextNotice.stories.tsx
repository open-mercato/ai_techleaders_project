import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../ui/button';
import { BookingSummary } from '../bookings/BookingSummary';
import { SessionIsTextNotice } from './SessionIsTextNotice';

const meta = {
  title: 'Product/Sessions/Text-session notice',
  component: SessionIsTextNotice,
  tags: ['autodocs'],
  parameters: {
    layout: 'padded',
    docs: {
      description: {
        component:
          'The one sentence every booking and session screen carries. It is a component rather than copy repeated per screen because the product makes exactly two statements about how a session works — it is written, and nothing is promised about how soon an answer arrives — and both are product decisions. Copied into eight screens, one of them eventually says something softer.',
      },
    },
  },
} satisfies Meta<typeof SessionIsTextNotice>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Callout: Story = {
  parameters: {
    docs: {
      description: {
        story: 'For a screen where the fact is news: booking, checkout, a first session.',
      },
    },
  },
};

export const Inline: Story = {
  args: { tone: 'inline' },
  parameters: {
    docs: {
      description: {
        story:
          'For a screen that already established it and is repeating it for the record, such as a sessions list.',
      },
    },
  },
};

export const OnABookingSummary: Story = {
  render: args => (
    <BookingSummary
      mentorName="Alex Laurent"
      startsAt="2026-09-20T09:00:00.000Z"
      dateLabel="20 September 2026"
      timeLabel="11:00"
      timeZone="Europe/Warsaw"
      duration={25}
      total="PLN 240.00"
      actions={
        <>
          <SessionIsTextNotice {...args} />
          <Button>Continue to payment</Button>
        </>
      }
    />
  ),
  parameters: {
    docs: {
      description: {
        story: 'Where it actually appears: next to the action that commits a mentee to pay.',
      },
    },
  },
};
