import { useRef, useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { http, HttpResponse } from 'msw';
import { z } from 'zod';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../ui/alert-dialog';
import { CrudForm, type CrudFormProps } from '../../backend/forms/CrudForm';
import { DataTable } from '../../backend/tables/DataTable';
import { MentorProfileEditor } from './MentorProfileEditor';

function WorkspaceForm({ title, description, form }: { title: string; description: string; form: CrudFormProps<Record<string, unknown>> }) {
  const [notice, setNotice] = useState('');
  return <div className="dm-product-panel"><div><h2 className="dm-product-heading">{title}</h2><p className="dm-product-muted">{description}</p></div>
    <CrudForm {...form} onCancel={() => setNotice('The host would return to your mentor home.')} onSuccess={() => setNotice('Saved in this local example.')} />
    {notice && <p role="status" className="dm-product-callout">{notice}</p>}
  </div>;
}

function ProfileExample() {
  const [notice, setNotice] = useState('');
  return <div className="dm-product-panel"><div><h2 className="dm-product-heading">Your mentor profile</h2><p className="dm-product-muted">Describe the help you offer and add a link to your public work. Review the saved profile before publishing.</p></div>
    <MentorProfileEditor initialValues={{ displayName: 'Alex Laurent', publicWorkUrl: 'https://example.com/alex/work', description: 'I help developers work through TypeScript API questions and decide where to test.', stacks: ['TypeScript', 'React'] }}
      endpoint="/storybook-api/mentor-workspace/profile" onSaved={() => setNotice('Profile saved in this example. Publication is a separate step.')} onCancel={() => setNotice('The host would return to your mentor home.')} />
    {notice && <p role="status" className="dm-product-callout">{notice}</p>}
  </div>;
}

const meta = {
  title: 'Product/Mentor workspace', tags: ['autodocs'],
  parameters: {
    msw: { handlers: [http.all('/storybook-api/mentor-workspace/:form', () => HttpResponse.json({ ok: true, data: { id: 'local-example' } }))] },
    docs: { description: { component: 'E02 #16/#17/#18 profile, price and availability examples, plus private-note drafting for #28. Profile editing uses MentorProfileEditor; other forms and lists reuse CrudForm and DataTable. Prices are PLN 90 to 600 for 25 minutes and PLN 180 to 1,200 for 50 minutes. Availability stores one UTC start time; the mentee selects the session length. Booked times cannot be removed here. Local mock requests illustrate saved states; the application must enforce ownership, future times, conflicts and confirmed booking price snapshots.' } },
  },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const EditProfile: Story = { render: () => <ProfileExample /> };
export const PublishAvailability: Story = { render: () => <WorkspaceForm title="Add an available time" description="Enter the start time in UTC. A mentee chooses 25 or 50 minutes when booking. The application checks that the time is available before saving it." form={{
  schema: z.object({ startsAt: z.string().min(1, 'Choose a start time.').refine(value => !Number.isNaN(Date.parse(`${value}Z`)), 'Enter a valid UTC start time.').transform(value => new Date(`${value}Z`).toISOString()) }),
  fields: [{ name: 'startsAt', label: 'Starts at (UTC)', type: 'datetime-local', required: true, description: 'All dates and times in this form use UTC.' }],
  initialValues: { startsAt: '2026-09-24T14:00' }, endpoint: '/storybook-api/mentor-workspace/availability', submitLabel: 'Add available time',
}} /> };

function storyPrice(minCents: bigint, maxCents: bigint, minMessage: string, maxMessage: string) {
  return z.string().regex(/^(?:0|[1-9]\d*)(?:\.(\d{1,2}))?$/, 'Use a PLN amount with no more than two decimal places.')
    .superRefine((value, context) => {
      if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(value)) return;
      const [whole, fraction = ''] = value.split('.');
      const cents = BigInt(`${whole}${fraction.padEnd(2, '0')}`);
      if (cents < minCents) context.addIssue({ code: 'custom', message: minMessage });
      if (cents > maxCents) context.addIssue({ code: 'custom', message: maxMessage });
    });
}

const priceForm: CrudFormProps<Record<string, unknown>> = {
  schema: z.object({
    '25': storyPrice(9_000n, 60_000n, 'The 25-minute price must be at least PLN 90.', 'The 25-minute price must be at most PLN 600.'),
    '50': storyPrice(18_000n, 120_000n, 'The 50-minute price must be at least PLN 180.', 'The 50-minute price must be at most PLN 1,200.'),
  }),
  fields: [
    { name: '25', label: '25-minute price', type: 'money', currency: 'PLN', required: true, description: 'Allowed price: PLN 90 to 600.' },
    { name: '50', label: '50-minute price', type: 'money', currency: 'PLN', required: true, description: 'Allowed price: PLN 180 to 1,200.' },
  ],
  initialValues: { '25': '180.00', '50': '340.00' }, endpoint: '/storybook-api/mentor-workspace/prices', submitLabel: 'Save prices',
};
export const SetSessionPrices: Story = { render: () => <WorkspaceForm title="Session prices" description="Set both prices before accepting bookings. Changes apply to new bookings; confirmed bookings keep their agreed price." form={priceForm} /> };
export const PriceBoundsError: Story = {
  render: () => <WorkspaceForm title="Session prices" description="Enter a PLN price within the allowed range for each session length." form={{ ...priceForm, initialValues: { '25': '89.00', '50': '1201.00' } }} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Save prices' }));
    await expect(canvas.getByText('The 25-minute price must be at least PLN 90.')).toBeVisible();
    await expect(canvas.getByText('The 50-minute price must be at most PLN 1,200.')).toBeVisible();
  },
};
export const MissingPrices: Story = {
  render: () => <WorkspaceForm title="Set prices to accept bookings" description="People can read your published profile, but they cannot book until you save both session prices." form={{ ...priceForm, initialValues: {} }} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Save prices' }));
    await expect(canvas.getByText('Set a price for 25 minutes.')).toBeVisible();
    await expect(canvas.getByText('Set a price for 50 minutes.')).toBeVisible();
  },
};
export const DraftPrivateNote: Story = { render: () => <WorkspaceForm title="Draft a private session note" description="Summarize the agreed decisions and next steps. Sending for approval does not publish the note." form={{ schema: z.object({ title: z.string().trim().min(3, 'Add a clear title.'), body: z.string().trim().min(20, 'Include the decisions and next steps from the session.') }), fields: [{ name: 'title', label: 'Note title' }, { name: 'body', label: 'Session note', type: 'textarea' }], initialValues: { title: 'A clearer API boundary', body: 'Validate at the HTTP boundary. Keep ownership checks in the service and return a DTO. Next: add tests for the invalid-input and forbidden-access paths.' }, endpoint: '/storybook-api/mentor-workspace/note', submitLabel: 'Send for approval' }} /> };

const availableTimes = [
  { id: 'open-time', date: '24 September 2026, 14:00 UTC', status: 'Available' },
  { id: 'booked-time', date: '24 September 2026, 16:00 UTC', status: 'Booked' },
];
function AvailabilityExample() {
  const [rows, setRows] = useState(availableTimes);
  const [removing, setRemoving] = useState<(typeof availableTimes)[number] | null>(null);
  const [notice, setNotice] = useState('');
  const [refused, setRefused] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  return <div className="dm-product-panel"><div><h2 ref={heading} tabIndex={-1} className="dm-product-heading">Your available times</h2><p className="dm-product-muted">All times use UTC. Remove an unbooked time when you are no longer available.</p></div>
    <DataTable caption="Mentor availability" columns={[
      { key: 'date', header: 'Start time (UTC)' },
      { key: 'status', header: 'Status', render: row => <Badge variant="outline">{row.status}</Badge> },
    ]} rows={rows} getRowId={row => row.id} emptyMessage="No available times" emptyDescription="Add a time when you can offer a text session."
      rowActions={row => <div className="dm-product-stack"><Button intent="error" appearance="ghost" size="sm"
        aria-label={`Remove ${row.date}`} aria-describedby={row.status === 'Booked' ? `${row.id}-reason` : undefined}
        onClick={() => { setNotice(''); setRefused(false); if (row.status === 'Booked') { setRefused(true); setNotice('This time has a confirmed booking. Open the session details to follow the cancellation process.'); } else setRemoving(row); }}>Remove time</Button>
        {row.status === 'Booked' && <p id={`${row.id}-reason`} className="dm-product-caption">A confirmed booking uses this time.</p>}</div>} />
    {notice && <p role={refused ? 'alert' : 'status'} className="dm-product-callout">{notice}</p>}
    <AlertDialog open={Boolean(removing)} onOpenChange={open => { if (!open) setRemoving(null); }}>
      <AlertDialogContent onCloseAutoFocus={event => { event.preventDefault(); heading.current?.focus(); }}>
        <AlertDialogHeader><AlertDialogTitle>Remove this available time?</AlertDialogTitle><AlertDialogDescription>{removing?.date} will no longer be available for new bookings.</AlertDialogDescription></AlertDialogHeader>
        <AlertDialogFooter><AlertDialogCancel>Keep time</AlertDialogCancel><AlertDialogAction variant="destructive" onClick={() => { setRows(current => current.filter(row => row.id !== removing?.id)); setNotice('The available time was removed from this example.'); }}>Remove time</AlertDialogAction></AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}
export const ManageAvailability: Story = { render: () => <AvailabilityExample /> };
export const RemoveAvailableTime: Story = {
  render: () => <AvailabilityExample />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Remove 24 September 2026, 14:00 UTC' }));
    const dialog = within(await within(canvasElement.ownerDocument.body).findByRole('alertdialog'));
    await expect(dialog.getByRole('button', { name: 'Keep time' })).toHaveFocus();
    await userEvent.click(dialog.getByRole('button', { name: 'Remove time' }));
    await expect(canvas.getByRole('status')).toHaveTextContent('The available time was removed');
    await expect(canvas.queryByRole('button', { name: 'Remove 24 September 2026, 14:00 UTC' })).not.toBeInTheDocument();
  },
};
export const BookedTimeCannotBeRemoved: Story = {
  render: () => <AvailabilityExample />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Remove 24 September 2026, 16:00 UTC' }));
    await expect(canvas.getByRole('alert')).toHaveTextContent('Open the session details to follow the cancellation process.');
    await expect(canvas.getByRole('button', { name: 'Remove 24 September 2026, 16:00 UTC' })).toBeVisible();
  },
};
