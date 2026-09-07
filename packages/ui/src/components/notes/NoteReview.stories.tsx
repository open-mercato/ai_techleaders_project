import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { http, HttpResponse } from 'msw';
import { z } from 'zod';
import { Button } from '../ui/button';
import { CrudForm } from '../../backend/forms/CrudForm';
import { NoteReview, VersionHistory } from './NoteReview';
const body = <><p>We agreed to keep request validation at the HTTP boundary and ownership checks in the service.</p><h3 className="dm-product-title">Your next steps</h3><ol><li>Add the shared request schema.</li><li>Return a DTO from the service.</li><li>Test an invalid request and an ownership failure.</li></ol></>;
const note = { title: 'A clearer API boundary', version: 2, state: 'awaiting-approval' as const, body, author: 'Alex Laurent', updatedLabel: '9 September, 15:10 Europe/Warsaw' };
const schema = z.object({ comment: z.string().trim().min(1, 'Tell the mentor what needs to change.') });
function ReviewExample() {
  const [state, setState] = useState<'awaiting-approval' | 'approved' | 'declined'>('awaiting-approval');
  const [declining, setDeclining] = useState(false);
  return <div className="dm-product-stack"><NoteReview {...note} state={state} declineComment={state === 'declined' ? 'Your requested changes were sent in this local example.' : undefined} actions={state === 'awaiting-approval' ? declining ? <CrudForm schema={schema} endpoint="/storybook-api/note-review" fields={[{ name: 'comment', label: 'What should change?', type: 'textarea', placeholder: 'Describe the correction or missing context.' }]} submitLabel="Send requested changes" onSuccess={() => setState('declined')} onCancel={() => setDeclining(false)} /> : <><Button intent="neutral" appearance="stroke" onClick={() => setDeclining(true)}>Request changes</Button><Button onClick={() => setState('approved')}>Approve full note</Button></> : <p role="status" className="dm-product-muted">{state === 'approved' ? 'Note approved in this local example.' : 'Changes requested in this local example.'}</p>} /><p className="dm-product-caption">Interactive local example. No note is stored or shared.</p></div>;
}
const meta = {
  title: 'Product/Private notes', component: NoteReview, tags: ['autodocs'], args: note,
  parameters: { msw: { handlers: [http.post('/storybook-api/note-review', () => HttpResponse.json({ ok: true, data: { version: 2 } }))] }, docs: { description: { component: 'Private note review and version history for #28/#29. Approval is for the whole note; declining uses the existing CrudForm with a required Zod-validated comment. The caller supplies authorized actions and persists transitions. Approval never publishes a note and does not require scrolling to an arbitrary point.' } } },
} satisfies Meta<typeof NoteReview>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Review: Story = { render: () => <ReviewExample /> };
export const RequiredDeclineComment: Story = { render: () => <ReviewExample />, play: async ({ canvasElement }) => { const canvas = within(canvasElement); await userEvent.click(canvas.getByRole('button', { name: 'Request changes' })); await userEvent.click(canvas.getByRole('button', { name: 'Send requested changes' })); await expect(canvas.getByText('Tell the mentor what needs to change.')).toBeVisible(); await userEvent.type(canvas.getByLabelText('What should change?'), 'Please include the migration constraint.'); await userEvent.click(canvas.getByRole('button', { name: 'Send requested changes' })); await expect(await canvas.findByText('Changes requested in this local example.')).toBeVisible(); } };
export const Draft: Story = { args: { state: 'draft', actions: <Button>Edit draft</Button> } };
export const Approved: Story = { args: { state: 'approved' } };
export const Declined: Story = { args: { state: 'declined', version: 1, declineComment: 'Please mention that we need to support the existing migration format.', actions: <Button>Create revised version</Button> } };
export const History: Story = { render: () => <VersionHistory versions={[
  { version: 2, author: 'Alex Laurent', updatedAt: '2026-09-09T13:10:00Z', dateLabel: '9 September, 15:10', state: 'awaiting-approval', detail: 'Added the migration constraint and updated the next steps.' },
  { version: 1, author: 'Alex Laurent', updatedAt: '2026-09-09T12:55:00Z', dateLabel: '9 September, 14:55', state: 'declined', detail: 'Jamie requested the existing migration format as context.' },
]} /> };
