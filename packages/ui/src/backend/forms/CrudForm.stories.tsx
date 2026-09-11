import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { delay, http, HttpResponse } from 'msw';
import { z } from 'zod';
import { CrudForm, type CrudFormProps } from './CrudForm';

const endpoint = (prefix: string) => `/storybook-api/profile/${prefix}`;
// One handler set and a unique URL per scenario also work with multiple Docs canvases.
const handlers = [
  http.put(endpoint('edit'), () => HttpResponse.json({ ok: true, data: { id: 'demo-profile' } })),
  http.post(endpoint('saving'), async () => { await delay(2500); return HttpResponse.json({ ok: true, data: { id: 'demo' } }); }),
  http.post(endpoint('serverField'), () => HttpResponse.json({ ok: false, error: { code: 'validation', message: 'Check your input.', fieldErrors: { serverFieldEmail: ['This example address is already in use.'] } } }, { status: 422 })),
  http.post(endpoint('serverError'), () => HttpResponse.json({ ok: false, error: { code: 'unavailable', message: 'The example service is unavailable. Your input is preserved.' } }, { status: 503 })),
  http.post(endpoint('network'), () => HttpResponse.error()),
  http.post('/storybook-api/profile/:example', () => HttpResponse.json({ ok: true, data: { id: 'demo-profile' } })),
];

// Scenario-specific field names keep mock server errors scoped to their example.
function formArgs(prefix: string): CrudFormProps<Record<string, unknown>> {
  return {
    schema: z.object({
      [`${prefix}Name`]: z.string().min(2, 'Enter at least two characters.'),
      [`${prefix}Email`]: z.email('Enter a valid email address.'),
      [`${prefix}Password`]: z.string().min(8, 'Use at least eight characters.'),
      [`${prefix}Day`]: z.string().min(1, 'Choose a day.'),
      [`${prefix}StartsAt`]: z.string().min(1, 'Choose a start time.'),
      [`${prefix}Price`]: z.number().min(5, 'The example minimum is 5.'),
      [`${prefix}Bio`]: z.string().min(5, 'Add a short introduction.'),
      [`${prefix}Updates`]: z.boolean(),
      [`${prefix}Stack`]: z.string().min(1, 'Choose a stack.'),
    }),
    fields: [
      { name: `${prefix}Name`, label: 'Display name', placeholder: 'Alex Laurent' },
      { name: `${prefix}Email`, label: 'Email address', type: 'email', placeholder: 'alex@example.com' },
      { name: `${prefix}Password`, label: 'Password', type: 'password' },
      { name: `${prefix}Day`, label: 'Availability day', type: 'date' },
      { name: `${prefix}StartsAt`, label: 'Availability starts at', type: 'datetime' },
      { name: `${prefix}Price`, label: 'Example price', type: 'number' },
      { name: `${prefix}Bio`, label: 'Introduction', type: 'textarea' },
      { name: `${prefix}Updates`, label: 'Send session updates', type: 'checkbox' },
      { name: `${prefix}Stack`, label: 'Stack', type: 'select', options: [{ label: 'React', value: 'react' }, { label: 'TypeScript', value: 'typescript' }, { label: 'Python', value: 'python' }, { label: 'AI agents', value: 'ai-agents' }] },
    ],
    endpoint: endpoint(prefix),
    initialValues: { [`${prefix}Name`]: 'Alex Laurent', [`${prefix}Email`]: 'alex@example.com', [`${prefix}Password`]: 'example-password', [`${prefix}Day`]: '2026-09-08', [`${prefix}StartsAt`]: '2026-09-08T14:30', [`${prefix}Price`]: 45, [`${prefix}Bio`]: 'I help developers reason through concrete problems.', [`${prefix}Updates`]: true, [`${prefix}Stack`]: 'react' },
    submitLabel: 'Save example', onCancel: fn(), onSuccess: fn(),
  };
}

function FormExample(args: CrudFormProps<Record<string, unknown>>) {
  const [saved, setSaved] = useState(false);
  return <div className="w-full max-w-md"><p className="mb-6 text-sm text-muted-foreground">Try editing the fields and saving your changes.</p><CrudForm {...args} onSuccess={data => { setSaved(true); args.onSuccess?.(data); }} />{saved && <p className="mt-4 text-sm" role="status">Your changes have been saved.</p>}</div>;
}

const meta = {
  title: 'Backend/Forms/CrudForm', component: CrudForm, tags: ['autodocs'],
  render: (args: CrudFormProps<Record<string, unknown>>) => <FormExample {...args} />,
  args: formArgs('all'),
  parameters: {
    msw: { handlers },
    controls: { exclude: ['schema', 'fields', 'initialValues', 'endpoint', 'method'] },
    docs: { description: { component: 'Schema-driven create and edit forms with text, email, password, number, money, date, datetime, local date-time, textarea, checkbox and select fields. Money fields visibly fix the currency and preserve the exact decimal string; datetime fields state the browser timezone and submit a UTC instant. Field and form errors are announced to assistive technology. Cmd/Ctrl+Enter saves; Escape cancels when no request is pending. Each instance has independent label and error IDs. Stories use local mock responses.' } },
  },
} satisfies Meta<CrudFormProps<Record<string, unknown>>>;
export default meta;
type Story = StoryObj<typeof meta>;

export const AllFieldTypes: Story = {};
export const Dates: Story = { args: {
  schema: z.object({ day: z.string().min(1, 'Choose a day.'), startsAt: z.string().min(1, 'Choose a start time.') }),
  fields: [{ name: 'day', label: 'Day', type: 'date', required: true }, { name: 'startsAt', label: 'Starts at', type: 'datetime', required: true }],
  initialValues: { day: '2026-09-08', startsAt: '2026-09-08T14:30' }, endpoint: endpoint('dates'), submitLabel: 'Save availability',
} };
export const Money: Story = { args: {
  schema: z.object({ price25: z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/, 'Use a decimal amount with no more than two places.') }),
  fields: [{
    name: 'price25', label: '25-minute price', type: 'money', currency: 'PLN', required: true,
    description: 'Allowed price: PLN 90 to 600.', placeholder: '90.00',
  }],
  initialValues: { price25: '90.00' }, endpoint: endpoint('money'), submitLabel: 'Save price',
} };
export const Edit: Story = { args: { ...formArgs('edit'), method: 'PUT' } };
export const ClientValidation: Story = {
  args: { ...formArgs('validation'), initialValues: { validationName: 'A' } },
  play: async ({ canvasElement }) => {
    const canvas=within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Save example' }));
    await expect(canvas.getByText('Enter at least two characters.')).toBeVisible();
    await expect(canvas.getByRole('textbox', { name: 'Display name' })).toHaveFocus();
  },
};
export const Saving: Story = {
  args: formArgs('saving'),
  play: async ({ canvasElement }) => {
    const canvas=within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Save example' }));
    await expect(canvas.getByRole('button', { name: 'Saving…' })).toBeDisabled();
  },
};
export const Success: Story = {
  args: formArgs('success'),
  play: async ({ canvasElement, args }) => {
    const canvas=within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Save example' }));
    await expect(await canvas.findByText('Your changes have been saved.')).toBeVisible();
    await expect(args.onSuccess).toHaveBeenCalled();
  },
};
export const ServerFieldErrors: Story = {
  args: formArgs('serverField'),
  play: async ({ canvasElement }) => {
    const canvas=within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Save example' }));
    await expect(await canvas.findByText('This example address is already in use.')).toBeVisible();
  },
};
export const ServerError: Story = {
  args: formArgs('serverError'),
  play: async ({ canvasElement }) => {
    const canvas=within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Save example' }));
    await expect(await canvas.findByText('The example service is unavailable. Your input is preserved.')).toBeVisible();
  },
};
export const NetworkError: Story = {
  args: formArgs('network'),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Save example' }));
    await expect(await canvas.findByText(/failed to fetch|network.*(?:error|failed)|load failed/i)).toBeVisible();
  },
};

export const FormValidation: Story = {
  args: {
    schema: z.object({ password: z.string().min(8), confirmation: z.string() }).refine(values => values.password === values.confirmation, 'The passwords must match.'),
    fields: [{ name: 'password', label: 'Password', type: 'password' }, { name: 'confirmation', label: 'Confirm password', type: 'password' }],
    initialValues: { password: 'example-password', confirmation: 'different-password' },
    endpoint: endpoint('password'),
    submitLabel: 'Change password',
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Change password' }));
    await expect(canvas.getByRole('alert')).toHaveTextContent('The passwords must match.');
    await expect(canvas.getByRole('alert')).toHaveFocus();
  },
};

export const RepeatedForms: Story = {
  render: () => <div className="grid w-full gap-8 md:grid-cols-2">
    {['Primary profile', 'Alternate profile'].map(label => <section key={label}>
      <h2 className="mb-4 text-lg font-medium">{label}</h2>
      <CrudForm schema={z.object({ name: z.string().min(2, 'Enter your name.') })} fields={[{ name: 'name', label: 'Display name' }]} endpoint={endpoint('repeated')} />
    </section>)}
  </div>,
};
