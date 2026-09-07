import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '../ui/button';
import { WrittenAnswer, SessionTranscript } from './WrittenAnswer';
const meta = {
  title: 'Product/Written answer and transcript', component: WrittenAnswer, tags: ['autodocs'],
  args: { state: 'posted', mentorName: 'Alex Laurent', body: <><p>Keep validation at the HTTP boundary, then pass a typed command into the service. This makes the domain function independent of the request format.</p><ol><li>Validate the incoming shape with the shared schema.</li><li>Return a small DTO rather than an ORM entity.</li><li>Cover the error and success paths at the boundary.</li></ol><pre><code>{'type Result<T> =\n  | { ok: true; data: T }\n  | { ok: false; error: AppError };'}</code></pre></>, publishedLabel: 'Posted 9 September 2026 at 14:40 Europe/Warsaw', actions: <Button intent="neutral" appearance="stroke">Review private session note</Button> },
  parameters: { docs: { description: { component: 'Written answer for #27 and a transcript composition for #26. The caller identifies its own messages with isOwn and supplies the composer. Names remain visible, own messages sit on the right, and received messages sit on the left. Message history can scroll with the keyboard and keeps its reading position when messages change. These examples use fictional messages; delivery transport and session-channel decision Q18 remain outside this component. Published answers have no Edit action while replacement policy is unresolved.' } } },
} satisfies Meta<typeof WrittenAnswer>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Posted: Story = {};
export const AwaitingAnswer: Story = { args: { state: 'owed', publishedLabel: undefined, actions: undefined } };
export const TextTranscript: Story = { render: () => <SessionTranscript messages={[
  { id: '1', author: 'Jamie Chen', sentAt: '2026-09-09T12:01:00Z', timeLabel: '14:01', body: <p>Where should I validate an API request before saving it?</p>, delivery: 'sent', isOwn: true },
  { id: '2', author: 'Alex Laurent', sentAt: '2026-09-09T12:02:00Z', timeLabel: '14:02', body: <p>At the HTTP boundary. What constraints does the service need to enforce independently?</p>, delivery: 'sent' },
]} composer={<p className="dm-product-callout">The text session has ended. Read the mentor&apos;s written answer when it is posted.</p>} /> };
export const DeliveryStates: Story = { render: () => <SessionTranscript messages={[
  { id: '1', author: 'Jamie Chen', sentAt: '2026-09-09T12:03:00Z', timeLabel: '14:03', body: <p>I can share a small example.</p>, delivery: 'sending', isOwn: true },
  { id: '2', author: 'Jamie Chen', sentAt: '2026-09-09T12:04:00Z', timeLabel: '14:04', body: <p>The service also checks ownership.</p>, delivery: 'failed', isOwn: true, actions: <Button intent="neutral" appearance="stroke" size="xs">Retry message</Button> },
]} composer={<p className="dm-product-caption">Composer and delivery transport are supplied by the chosen session channel.</p>} /> };
export const BeforeSession: Story = { render: () => <SessionTranscript messages={[]} emptyMessage="Your text session starts on 9 September at 14:00 Europe/Warsaw." composer={<Button disabled>Session has not started</Button>} /> };
export const CodeAndLineBreaks: Story = { render: () => <SessionTranscript messages={[
  { id: '1', author: 'Jamie Chen', sentAt: '2026-09-09T12:05:00Z', timeLabel: '14:05', body: 'The caller checks data and error separately.\nCan I keep the current return values?', delivery: 'sent', isOwn: true },
  { id: '2', author: 'Alex Laurent', sentAt: '2026-09-09T12:06:00Z', timeLabel: '14:06', body: <><p>Yes. Add an explicit result type, then update one caller before migrating the rest.</p><pre><code>{'type Result<T> =\n  | { ok: true; data: T }\n  | { ok: false; error: AppError };\n\nif (result.ok) {\n  return result.data;\n}'}</code></pre><p>The error branch can then handle the failure without checking data again.</p></>, delivery: 'sent' },
]} composer={null} /> };
export const LongConversation: Story = { render: () => <SessionTranscript messages={[
  { id: '1', author: 'Jamie Chen', sentAt: '2026-09-09T12:01:00Z', timeLabel: '14:01', body: 'My API result has optional data and error fields. Every caller checks both.', delivery: 'sent', isOwn: true },
  { id: '2', author: 'Alex Laurent', sentAt: '2026-09-09T12:02:00Z', timeLabel: '14:02', body: 'Can you share one caller and the result type?', delivery: 'sent' },
  { id: '3', author: 'Jamie Chen', sentAt: '2026-09-09T12:03:00Z', timeLabel: '14:03', body: <pre><code>{'type Result = {\n  data?: User;\n  error?: AppError;\n};'}</code></pre>, delivery: 'sent', isOwn: true },
  { id: '4', author: 'Alex Laurent', sentAt: '2026-09-09T12:04:00Z', timeLabel: '14:04', body: 'This allows both fields to be missing. A union makes success and failure separate cases.', delivery: 'sent' },
  { id: '5', author: 'Jamie Chen', sentAt: '2026-09-09T12:05:00Z', timeLabel: '14:05', body: 'There are several existing consumers. I need to migrate them one at a time.', delivery: 'sent', isOwn: true },
  { id: '6', author: 'Alex Laurent', sentAt: '2026-09-09T12:06:00Z', timeLabel: '14:06', body: 'Start with an adapter for the old result. You can remove it once the callers accept the union.', delivery: 'sent' },
  { id: '7', author: 'Jamie Chen', sentAt: '2026-09-09T12:07:00Z', timeLabel: '14:07', body: 'One test includes this long identifier:\nrequest_9c45982dd5104e58ac19c45982dd5104e58ac19c45982dd5104e58ac19c45982dd5104e58ac1', delivery: 'sent', isOwn: true },
  { id: '8', author: 'Alex Laurent', sentAt: '2026-09-09T12:08:00Z', timeLabel: '14:08', body: 'Keep that test. Add a case where the old result contains neither field so the adapter handles it explicitly.', delivery: 'sent' },
]} composer={<p className="dm-product-callout">Session ended. Your written answer is available in session details.</p>} /> };
