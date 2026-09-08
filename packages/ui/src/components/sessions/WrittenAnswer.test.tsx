// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { WrittenAnswer, SessionTranscript } from './WrittenAnswer';
afterEach(cleanup);
it('keeps an owed answer unavailable and exposes posted content without an implicit editing action', () => {
  const { rerender } = render(<WrittenAnswer state="owed" mentorName="Alex" body={<p>Draft should not appear</p>} />);
  expect(screen.queryByText('Draft should not appear')).toBeNull();
  expect(screen.getByText('Awaiting answer')).toBeTruthy();
  rerender(<WrittenAnswer state="posted" mentorName="Alex" body={<p>Use a discriminated union.</p>} publishedLabel="Posted 9 September" actions={<a href="#note">Review session note</a>} />);
  expect(screen.getByText('Use a discriminated union.')).toBeTruthy();
  expect(screen.getByText('Posted 9 September')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /edit/i })).toBeNull();
});
it('renders transcript delivery states, retry slots and supplied channel composition in chronological input order', () => {
  const retry = vi.fn();
  render(<SessionTranscript messages={[
    { id: '1', author: 'Jamie', sentAt: '2026-09-09T12:01:00Z', timeLabel: '14:01', body: 'What about validation?', delivery: 'sent', isOwn: true },
    { id: '2', author: 'Alex', sentAt: '2026-09-09T12:02:00Z', timeLabel: '14:02', body: 'Start at the boundary.', delivery: 'sending' },
    { id: '3', author: 'Jamie', sentAt: '2026-09-09T12:03:00Z', timeLabel: '14:03', body: 'Here is an example.', delivery: 'failed', isOwn: true, actions: <button onClick={retry}>Retry message</button> },
  ]} composer={<p>Text session ended. Sending is unavailable.</p>} />);
  const messages = screen.getAllByRole('listitem');
  expect(messages.map(message => message.querySelector('time')?.dateTime)).toEqual([
    '2026-09-09T12:01:00Z', '2026-09-09T12:02:00Z', '2026-09-09T12:03:00Z',
  ]);
  expect(screen.getByText('Sent')).toBeTruthy();
  expect(screen.getByText('Sending…')).toBeTruthy();
  expect(screen.getByText('Not sent')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Retry message' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Retry message' }));
  expect(retry).toHaveBeenCalledOnce();
  expect(screen.getByText('Text session ended. Sending is unavailable.')).toBeTruthy();
});
it('distinguishes ownership explicitly, keeps author names visible and hides decorative initials from assistive technology', () => {
  render(<SessionTranscript messages={[
    { id: '1', author: '  Alex Laurent  ', sentAt: '2026-09-09T12:01:00Z', timeLabel: '14:01', body: 'I can reproduce it.', delivery: 'sent', isOwn: false },
    { id: '2', author: 'Alex Laurent', sentAt: '2026-09-09T12:02:00Z', timeLabel: '14:02', body: 'Here is the caller.', delivery: 'sent', isOwn: true, initials: 'AX' },
    { id: '3', author: '', sentAt: '2026-09-09T12:03:00Z', timeLabel: '14:03', body: 'Imported message', delivery: 'sent' },
  ]} composer={null} />);
  const received = screen.getByText('I can reproduce it.').closest('li')!;
  const own = screen.getByText('Here is the caller.').closest('li')!;
  const imported = screen.getByText('Imported message').closest('li')!;
  expect(received.dataset.own).toBe('false');
  expect(within(received).getByText('Alex Laurent')).toBeTruthy();
  expect(within(received).getByText('AL').getAttribute('aria-hidden')).toBe('true');
  expect(within(received).queryByText('Sent')).toBeNull();
  expect(within(received).queryByText('You')).toBeNull();
  expect(own.dataset.own).toBe('true');
  expect(within(own).getByText('Alex Laurent')).toBeTruthy();
  expect(within(own).getByText('You')).toBeTruthy();
  expect(within(own).getByText('AX').getAttribute('aria-hidden')).toBe('true');
  expect(within(own).getByText('Sent')).toBeTruthy();
  expect(within(imported).getByText('?')).toBeTruthy();
  expect(screen.queryByText(/online|typing|read/i)).toBeNull();
});
it('keeps message history keyboard reachable and preserves reading position and composer focus when a message arrives', () => {
  const initial = [{ id: '1', author: 'Jamie Chen', sentAt: '2026-09-09T12:01:00Z', timeLabel: '14:01', body: 'First line\nSecond line', delivery: 'sent' as const, isOwn: true }];
  const composer = <textarea aria-label="Message to Alex" defaultValue="Unsent draft" />;
  const { rerender } = render(<SessionTranscript messages={initial} composer={composer} />);
  const history = screen.getByRole('region', { name: 'Message history' });
  expect(history.tabIndex).toBe(0);
  history.focus();
  expect(document.activeElement).toBe(history);
  history.scrollTop = 120;
  const input = screen.getByRole('textbox', { name: 'Message to Alex' });
  input.focus();
  rerender(<SessionTranscript messages={[...initial, { id: '2', author: 'Alex Laurent', sentAt: '2026-09-09T12:02:00Z', timeLabel: '14:02', body: <pre><code>{'if (result.ok) {\n  return result.data;\n}'}</code></pre>, delivery: 'sent' }]} composer={composer} />);
  expect(document.activeElement).toBe(input);
  expect(history.scrollTop).toBe(120);
  expect((input as HTMLTextAreaElement).value).toBe('Unsent draft');
  expect(screen.getByText('First line Second line').textContent).toBe('First line\nSecond line');
  expect(history.querySelector('code')?.textContent).toBe('if (result.ok) {\n  return result.data;\n}');
});
it('supports default and supplied empty transcript explanations', () => {
  const { rerender } = render(<SessionTranscript messages={[]} composer={null} />);
  expect(screen.getByText('No messages in this text session yet.')).toBeTruthy();
  rerender(<SessionTranscript messages={[]} composer={null} emptyMessage="The session has not started." />);
  expect(screen.getByText('The session has not started.')).toBeTruthy();
});
