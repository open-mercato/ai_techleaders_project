import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { http, HttpResponse } from 'msw';
import { z } from 'zod';
import { Button } from '../ui/button';
import { CrudForm, type CrudFormProps } from '../../backend/forms/CrudForm';
import { DataTable } from '../../backend/tables/DataTable';

const profile: CrudFormProps<Record<string, unknown>> = {
  schema: z.object({ displayName: z.string().trim().min(2, 'Enter your display name.'), publicWork: z.url('Enter a full URL for your public work.'), description: z.string().trim().min(20, 'Tell mentees what you can help them with.'), stack: z.string().min(1, 'Choose a primary stack.') }),
  fields: [{ name: 'displayName', label: 'Display name' }, { name: 'publicWork', label: 'Link to public work', placeholder: 'https://github.com/your-name' }, { name: 'description', label: 'How you can help', type: 'textarea' }, { name: 'stack', label: 'Primary stack', type: 'select', options: [{ label: 'TypeScript', value: 'typescript' }, { label: 'React', value: 'react' }, { label: 'Python', value: 'python' }] }],
  initialValues: { displayName: 'Alex Laurent', publicWork: 'https://example.com/alex/work', description: 'I help developers work through TypeScript API questions and decide where to test.', stack: 'typescript' },
  endpoint: '/storybook-api/mentor-workspace/profile', submitLabel: 'Save profile',
};

function WorkspaceForm({ title, description, form }: { title: string; description: string; form: CrudFormProps<Record<string, unknown>> }) {
  const [saved, setSaved] = useState(false);
  return <div className="dm-product-panel"><div><h2 className="dm-product-heading">{title}</h2><p className="dm-product-muted">{description}</p></div><CrudForm {...form} onSuccess={() => setSaved(true)} />{saved && <p role="status" className="dm-product-callout">Saved in this local example. No account, availability or note was changed.</p>}</div>;
}

const meta = {
  title: 'Product/Mentor workspace', tags: ['autodocs'],
  parameters: { msw: { handlers: [http.post('/storybook-api/mentor-workspace/:form', () => HttpResponse.json({ ok: true, data: { id: 'local-example' } }))] }, docs: { description: { component: 'Mentor editing forms and tables using CrudForm and DataTable for #16/#17/#18/#28. They share client/server schema shapes and use only local MSW requests. Date-times are local wall-clock inputs with an explicit timezone; the application must resolve timezone/DST and validate booking conflicts. Example price bounds are story configuration, not product policy.' } } },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const EditProfile: Story = { render: () => <WorkspaceForm title="Your mentor profile" description="Describe what you can help with and add a link to your public work." form={profile} /> };

export const PublishAvailability: Story = { render: () => <WorkspaceForm title="Publish a text session time" description="Enter local times in the selected timezone. The application checks conflicts before publishing." form={{
  schema: z.object({ startsAt: z.string().min(1, 'Choose a start time.'), endsAt: z.string().min(1, 'Choose an end time.'), timeZone: z.enum(['Europe/Warsaw', 'UTC', 'America/New_York']) }).refine(value => value.endsAt > value.startsAt, { path: ['endsAt'], message: 'End time must be after start time.' }),
  fields: [{ name: 'startsAt', label: 'Starts at', type: 'datetime-local' }, { name: 'endsAt', label: 'Ends at', type: 'datetime-local' }, { name: 'timeZone', label: 'Timezone', type: 'select', options: [{ label: 'Europe/Warsaw', value: 'Europe/Warsaw' }, { label: 'UTC', value: 'UTC' }, { label: 'America/New_York', value: 'America/New_York' }] }],
  initialValues: { startsAt: '2026-09-09T14:00', endsAt: '2026-09-09T15:00', timeZone: 'Europe/Warsaw' }, endpoint: '/storybook-api/mentor-workspace/availability', submitLabel: 'Publish availability',
}} /> };

const priceForm: CrudFormProps<Record<string, unknown>> = {
  schema: z.object({ price25: z.number('Set a price for 25 minutes.').min(5, 'The example minimum is 5.').max(300, 'The example maximum is 300.'), price50: z.number('Set a price for 50 minutes.').min(10, 'The example minimum is 10.').max(600, 'The example maximum is 600.'), currency: z.enum(['EUR', 'USD']) }),
  fields: [{ name: 'price25', label: '25-minute price', type: 'number' }, { name: 'price50', label: '50-minute price', type: 'number' }, { name: 'currency', label: 'Currency', type: 'select', options: [{ label: 'EUR', value: 'EUR' }, { label: 'USD', value: 'USD' }] }],
  initialValues: { price25: 45, price50: 80, currency: 'EUR' }, endpoint: '/storybook-api/mentor-workspace/prices', submitLabel: 'Save prices',
};
export const SetSessionPrices: Story = { render: () => <WorkspaceForm title="Session prices" description="Set a price for each session length. This example allows 5 to 300 for 25 minutes and 10 to 600 for 50 minutes, in the selected currency." form={priceForm} /> };
export const PriceBoundsError: Story = { render: () => <WorkspaceForm title="Session prices" description="The bounds in this example come from the operator configuration." form={{ ...priceForm, initialValues: { price25: 2, price50: 80, currency: 'EUR' } }} />, play: async ({ canvasElement }) => { const canvas = within(canvasElement); await userEvent.click(canvas.getByRole('button', { name: 'Save prices' })); await expect(canvas.getByText('The example minimum is 5.')).toBeVisible(); } };
export const DraftPrivateNote: Story = { render: () => <WorkspaceForm title="Draft a private session note" description="Summarize the agreed decisions and next steps. Sending for approval does not publish the note." form={{ schema: z.object({ title: z.string().trim().min(3, 'Add a clear title.'), body: z.string().trim().min(20, 'Include the decisions and next steps from the session.') }), fields: [{ name: 'title', label: 'Note title' }, { name: 'body', label: 'Session note', type: 'textarea' }], initialValues: { title: 'A clearer API boundary', body: 'Validate at the HTTP boundary. Keep ownership checks in the service and return a DTO. Next: add tests for the invalid-input and forbidden-access paths.' }, endpoint: '/storybook-api/mentor-workspace/note', submitLabel: 'Send for approval' }} /> };
export const ManageAvailability: Story = { render: () => <div className="dm-product-panel"><div><h2 className="dm-product-heading">Your available times</h2><p className="dm-product-muted">Europe/Warsaw: Booked times cannot be removed.</p></div><DataTable columns={[{ key: 'date', header: 'Text session time' }, { key: 'status', header: 'Status' }]} rows={[{ id: '1', date: '9 September, 14:00–15:00', status: 'Open' }, { id: '2', date: '9 September, 16:00–17:00', status: 'Booked' }]} getRowId={row => row.id} rowActions={row => <div className="dm-product-stack"><Button intent="error" appearance="ghost" size="xs" disabled={row.status === 'Booked'} aria-describedby={row.status === 'Booked' ? 'booked-slot-reason' : undefined}>Remove time</Button>{row.status === 'Booked' && <p id="booked-slot-reason" className="dm-product-caption">This time has a confirmed booking.</p>}</div>} /></div> };
