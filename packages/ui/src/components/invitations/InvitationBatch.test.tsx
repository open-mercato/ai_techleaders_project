// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { InvitationBatch } from './InvitationBatch';
afterEach(cleanup);
it.each(['open', 'full', 'stopped'] as const)('renders %s batch progress without implicitly inviting anyone', state => {
  render(<InvitationBatch label="September mentor batch" sent={20} capacity={20} state={state} invitations={[]} actions={<button disabled>Invite mentor</button>} />);
  expect(screen.getByText('20 of 20 invitations sent')).toBeTruthy();
  expect(screen.getByText(state)).toBeTruthy();
  expect(screen.getByText('No invitations in this batch yet.')).toBeTruthy();
});
it('reuses DataTable for each invitation state and shows server-supplied publication deadlines', () => {
  render(<InvitationBatch label="Batch 1" sent={4} capacity={20} state="open" actions={null} invitations={(['invited', 'accepted', 'published', 'overdue'] as const).map((status, index) => ({ id: String(index), name: `Mentor ${index}`, email: `mentor${index}@example.com`, status, deadline: '21 September' }))} />);
  expect(screen.getAllByRole('row')).toHaveLength(5);
  expect(screen.getByRole('region', { name: 'Invitation progress for Batch 1 table' })).toBeTruthy();
  expect(screen.getByText('published').dataset.tone).toBe('success');
  expect(screen.getByText('overdue').dataset.tone).toBe('error');
  expect(screen.getByText('mentor1@example.com')).toBeTruthy();
  expect(screen.getAllByText('21 September')).toHaveLength(4);
});
