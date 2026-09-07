// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { NoteReview, VersionHistory } from './NoteReview';
afterEach(cleanup);
it.each(['draft', 'awaiting-approval', 'approved', 'declined'] as const)('renders %s privately without imposing a scroll approval gate', state => {
  const { container } = render(<NoteReview title="API boundary decisions" version={2} state={state} body={<p>Validate at the boundary.</p>} author="Alex" updatedLabel="Today at 15:10" actions={<button>Review note</button>} />);
  expect(screen.getByText(/Version 2/)).toBeTruthy();
  expect(screen.getByText('This note is private. Approving it does not publish it.')).toBeTruthy();
  expect(screen.getByText('Validate at the boundary.')).toBeTruthy();
  expect(screen.getByText('Private session note')).toBeTruthy();
  expect(screen.getByText('By Alex')).toBeTruthy();
  expect(screen.getByText('Today at 15:10')).toBeTruthy();
  expect(container.textContent).not.toMatch(/[·•]/);
  expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(false);
  expect(screen.queryByText('Requested changes')).toBeNull();
});
it('shows a decline comment without presenting it as public content', () => {
  render(<NoteReview title="Session note" version={1} state="declined" body="Original note" author="Alex" updatedLabel="Yesterday" declineComment="Please include the migration constraint." />);
  expect(screen.getByText('Please include the migration constraint.')).toBeTruthy();
  expect(screen.getByText('Requested changes')).toBeTruthy();
});
it('shows empty and populated histories without sorting or mutating authoritative versions', () => {
  const { container, rerender } = render(<VersionHistory versions={[]} />);
  expect(screen.getByText('No saved versions yet.')).toBeTruthy();
  rerender(<VersionHistory versions={[
    { version: 2, author: 'Alex', updatedAt: '2026-09-09T15:10:00Z', dateLabel: 'Today', state: 'awaiting-approval', detail: 'Added migration constraint.' },
    { version: 1, author: 'Alex', updatedAt: '2026-09-08T15:10:00Z', dateLabel: 'Yesterday', state: 'declined', detail: 'Requested migration context.' },
  ]} />);
  expect(screen.getAllByRole('listitem')[0]?.textContent).toContain('Version 2');
  expect(screen.getByText('Yesterday').getAttribute('datetime')).toBe('2026-09-08T15:10:00Z');
  expect(screen.getAllByText('Alex')).toHaveLength(2);
  expect(screen.getByText('Today').getAttribute('datetime')).toBe('2026-09-09T15:10:00Z');
  expect(container.textContent).not.toMatch(/[·•]/);
});
