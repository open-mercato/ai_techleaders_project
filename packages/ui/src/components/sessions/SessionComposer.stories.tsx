import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { SessionComposer, type SessionComposerProps } from './SessionComposer';

/** The server's bound (`MAX_MESSAGE_LENGTH`), mirrored here so the count reads realistically. */
const MAX = 4000;

function ComposerExample(args: SessionComposerProps) {
  const [value, setValue] = useState(args.value);
  return <div className="dm-product-panel">
    <SessionComposer
      {...args}
      value={value}
      onChange={(next) => { setValue(next); args.onChange(next); }}
      onSend={() => { args.onSend(); setValue(''); }}
    />
  </div>;
}

const meta = {
  title: 'Product/Session composer', component: SessionComposer, tags: ['autodocs'],
  render: (args) => <ComposerExample {...args} />,
  args: { value: '', maxLength: MAX, onChange: fn(), onSend: fn() },
  parameters: { docs: { description: { component: 'The control a party writes a text-session message with (#26), reused later by the written answer (#27) and the session note (#28). It is presentational: the caller owns the clock and decides whether the session is open, which is why every state below is reachable here with no database. Enter keeps its newline; the send shortcut is Ctrl or Cmd with Enter. Whitespace alone is not a message, and a closed session replaces the controls with the reason rather than disabling them, because a disabled textarea invites typing and then discards it.' } } },
} satisfies Meta<typeof SessionComposer>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Open: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole('button', { name: 'Send' })).toBeDisabled();
    await userEvent.type(canvas.getByLabelText('Your message'), 'Where should I validate the request?');
    await expect(canvas.getByRole('button', { name: 'Send' })).toBeEnabled();
    await userEvent.click(canvas.getByRole('button', { name: 'Send' }));
    await expect(args.onSend).toHaveBeenCalled();
  },
};

export const Typed: Story = { args: { value: 'I keep validation at the route and pass a typed command into the service.' } };

export const Sending: Story = { args: { value: 'One moment — sending this.', pending: true } };

export const Refused: Story = {
  args: { value: 'Did this arrive?', error: 'This session has ended. The mentor’s written answer comes next.' },
};

export const OverTheLimit: Story = { args: { value: 'x'.repeat(MAX + 12) } };

export const BeforeTheSessionStarts: Story = {
  args: { closedReason: 'This session starts on 14 September at 16:00 Europe/Warsaw. You can write here from then.' },
};

export const AfterTheSessionEnded: Story = {
  args: { closedReason: 'This session has ended. The transcript stays here, and the mentor’s written answer comes next.' },
};

export const WrittenAnswerReuse: Story = {
  args: {
    value: '',
    label: 'Your written answer',
    placeholder: 'Answer the question the session left open',
    sendLabel: 'Post answer',
  },
};
