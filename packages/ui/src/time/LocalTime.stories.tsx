import type { Meta, StoryObj } from '@storybook/react-vite';
import { LocalTime } from './LocalTime';

const meta = {
  title: 'Utilities/Local time',
  component: LocalTime,
  tags: ['autodocs'],
  args: { value: '2026-09-24T08:00:00.000Z' },
  parameters: {
    docs: {
      description: {
        component: 'Hydration-safe instant rendering for public and workspace surfaces. The server and first client render use an explicit UTC label; after mount, the same instant is shown in the viewer timezone. The host always supplies the authoritative UTC ISO value.',
      },
    },
  },
} satisfies Meta<typeof LocalTime>;

export default meta;
type Story = StoryObj<typeof meta>;

export const DateAndTime: Story = {};
export const DateOnly: Story = {
  args: { options: { day: 'numeric', month: 'long', year: 'numeric' } },
};
