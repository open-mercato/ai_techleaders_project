import { useState } from 'react';
import type { ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { Button } from '../ui/button';
import { ErrorMessage } from '../../backend/feedback/ErrorMessage';
import { SessionHeader } from './SessionCard';
import { SessionComposer } from './SessionComposer';
import { SessionIsTextNotice, SESSION_IS_TEXT_MESSAGE } from './SessionIsTextNotice';
import { SessionTranscript, type SessionMessage } from './WrittenAnswer';

/**
 * The whole session screen (#26), composed from the parts the design system already ships,
 * at each of the three window states the server can report.
 *
 * It is a composition rather than a component: the page owns the polling, the party check
 * and the clock, and none of those belong in the design system. What this file is for is the
 * other half of that arrangement — proving that the composition reads correctly at every
 * state, and giving manual QA something to open before a database exists.
 */
const MAX = 4000;

const exchange: SessionMessage[] = [
  { id: '1', author: 'Jamie Chen', sentAt: '2026-09-14T14:01:00Z', timeLabel: '16:01', body: <p>My API result has optional data and error fields, and every caller checks both. Where should I start?</p>, delivery: 'sent', isOwn: true },
  { id: '2', author: 'Alex Laurent', sentAt: '2026-09-14T14:02:00Z', timeLabel: '16:02', body: <p>Make success and failure separate cases first. Can you paste the current type?</p>, delivery: 'sent' },
  { id: '3', author: 'Jamie Chen', sentAt: '2026-09-14T14:03:00Z', timeLabel: '16:03', body: <pre><code>{'type Result = {\n  data?: User;\n  error?: AppError;\n};'}</code></pre>, delivery: 'sent', isOwn: true },
];

function SessionScreenExample({
  state,
  schedule,
  messages,
  emptyMessage,
  composer,
}: {
  state: 'upcoming' | 'open' | 'ended';
  schedule: string;
  messages: SessionMessage[];
  emptyMessage?: string;
  composer: ReactNode;
}) {
  return <div className="dm-product-stack">
    <SessionHeader
      title="Text session with Alex Laurent"
      state={state}
      participants="Jamie Chen and Alex Laurent"
      schedule={schedule}
      notice={SESSION_IS_TEXT_MESSAGE}
    />
    <SessionIsTextNotice tone="inline" />
    <SessionTranscript messages={messages} emptyMessage={emptyMessage} composer={composer} />
  </div>;
}

/** The open state, with the composer wired to local state the way the page wires it to the route. */
function OpenSessionExample() {
  const [value, setValue] = useState('');
  const [messages, setMessages] = useState(exchange);
  return <SessionScreenExample
    state="open"
    schedule="14 September 16:00 to 16:50 Europe/Warsaw"
    messages={messages}
    composer={<SessionComposer
      value={value}
      maxLength={MAX}
      onChange={setValue}
      onSend={() => {
        setMessages((current) => [...current, {
          id: `local-${current.length}`,
          author: 'Jamie Chen',
          sentAt: '2026-09-14T14:04:00Z',
          timeLabel: '16:04',
          body: value,
          delivery: 'sent',
          isOwn: true,
        }]);
        setValue('');
      }}
    />}
  />;
}

const meta = {
  title: 'Product/Session screen', tags: ['autodocs'],
  parameters: { docs: { description: { component: 'The 25- or 50-minute text session of #26, as one screen for both parties, at each window state the server reports: before the start, open, and ended. The window is arithmetic on the booking (start plus the booked length) computed from the server clock, so these stories state a window rather than deriving one. Every state carries the R03 line and offers no audio or video control. Where the exchange itself lives is still Q18, open with founder A; this is its plain reading. The refused story is what a user who is not one of the two parties gets.' } } },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const BeforeTheStart: Story = {
  render: () => <SessionScreenExample
    state="upcoming"
    schedule="14 September 16:00 to 16:50 Europe/Warsaw"
    messages={[]}
    emptyMessage="Your text session starts on 14 September at 16:00 Europe/Warsaw."
    composer={<SessionComposer
      value=""
      maxLength={MAX}
      onChange={() => undefined}
      onSend={() => undefined}
      closedReason="This session has not started yet. You can write here from 16:00 Europe/Warsaw."
    />}
  />,
};

export const Open: Story = {
  render: () => <OpenSessionExample />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByText(SESSION_IS_TEXT_MESSAGE).length).toBeGreaterThan(0);
    await userEvent.type(canvas.getByLabelText('Your message'), 'That helps, thank you.');
    await userEvent.click(canvas.getByRole('button', { name: 'Send' }));
    await expect(canvas.getByText('That helps, thank you.')).toBeVisible();
  },
};

export const Ended: Story = {
  render: () => <SessionScreenExample
    state="ended"
    schedule="14 September 16:00 to 16:50 Europe/Warsaw"
    messages={exchange}
    composer={<SessionComposer
      value=""
      maxLength={MAX}
      onChange={() => undefined}
      onSend={() => undefined}
      closedReason="This session has ended. The transcript stays here, and the mentor’s written answer comes next."
    />}
  />,
};

export const RefusedToAnyoneElse: Story = {
  render: () => <ErrorMessage
    message="This session belongs to the mentee and the mentor who booked it."
    action={<Button intent="neutral" appearance="stroke">Back to your sessions</Button>}
  />,
};
