import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import { delay, http, HttpResponse } from 'msw';
import { MentorProfileEditor, type MentorProfileEditorProps } from './MentorProfileEditor';

const filled = {
  displayName: 'Alex Laurent',
  description: 'I help developers debug TypeScript APIs and plan gradual migrations. Bring a small code example and explain what you have already tried.',
  publicWorkUrl: 'https://example.com/alex/work', stacks: ['TypeScript', 'React'],
};
const empty = { displayName: '', description: '', publicWorkUrl: '', stacks: [] };
const endpoint = (state: string) => `/storybook-api/mentor-profile/${state}`;
const handlers = [
  http.put(endpoint('pending'), async () => { await delay('infinite'); return HttpResponse.json({ ok: true, data: filled }); }),
  http.put(endpoint('failure'), () => HttpResponse.json({ ok: false, error: { code: 'unavailable', message: 'Your profile could not be saved. Try again; your entries are still here.' } }, { status: 503 })),
  http.put(endpoint('technology-error'), () => HttpResponse.json({ ok: false, error: { code: 'validation_error', message: 'Check your technologies.', fieldErrors: { stacks: ['Choose a supported technology.'] } } }, { status: 422 })),
  http.put('/storybook-api/mentor-profile/:state', async ({ request }) => HttpResponse.json({ ok: true, data: await request.json() })),
];

function ProfileExample(args: MentorProfileEditorProps) {
  const [notice, setNotice] = useState('');
  return <div className="dm-product-panel" style={{ maxWidth: 800, marginInline: 'auto' }}>
    <div style={{ display: 'grid', gap: 8 }}><h2 className="dm-product-heading">Your mentor profile</h2>
      <p className="dm-product-muted">Describe the help you offer and show a sample of your work. You can review the saved profile before publishing.</p></div>
    <MentorProfileEditor {...args} onSaved={data => { setNotice('Profile saved in this example. Publication is a separate step.'); args.onSaved(data); }}
      onCancel={() => { setNotice('The host would return to your mentor home.'); args.onCancel(); }} />
    {notice && <p role="status" className="dm-product-callout">{notice}</p>}
  </div>;
}

const meta = {
  title: 'Product/Mentor profile editor', component: MentorProfileEditor, tags: ['autodocs'],
  args: { initialValues: filled, endpoint: endpoint('saved'), onSaved: fn(), onCancel: fn(), onSubmittingChange: fn() },
  render: args => <ProfileExample {...args} />,
  parameters: {
    msw: { handlers }, controls: { exclude: ['initialValues', 'endpoint'] },
    docs: { description: { component: 'E02 #16 profile editor. All four fields are required to save. The description allows up to 2,000 characters, the work link must use HTTP or HTTPS, and technologies allow multiple selections with labelled decorative icons. CrudForm owns validation, pending requests, server errors and focus. The host saves the values and handles publication separately. Examples use local mock responses.' } },
  },
} satisfies Meta<typeof MentorProfileEditor>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Filled: Story = {};
export const Empty: Story = { args: { initialValues: empty } };
export const Pending: Story = {
  args: { endpoint: endpoint('pending') },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Save profile' }));
    await expect(canvas.getByRole('button', { name: 'Saving…' })).toBeDisabled();
    await expect(canvas.getByRole('checkbox', { name: 'React' })).toBeDisabled();
    await expect(canvas.getByRole('button', { name: 'Cancel' })).toBeDisabled();
  },
};
export const RequiredFields: Story = {
  args: { initialValues: empty },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Save profile' }));
    await expect(canvas.getByRole('textbox', { name: 'Display name' })).toHaveFocus();
    await expect(canvas.getByText('Choose at least one technology or topic.')).toBeVisible();
  },
};
export const TechnologyRequired: Story = {
  args: { initialValues: { ...filled, stacks: [] } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Save profile' }));
    await expect(canvas.getByRole('group', { name: 'Technologies and topics' })).toHaveFocus();
  },
};
export const InvalidWorkLink: Story = {
  args: { initialValues: { ...filled, publicWorkUrl: 'github.com/alex' } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Save profile' }));
    await expect(canvas.getByRole('textbox', { name: 'Public work link' })).toHaveFocus();
    await expect(canvas.getByRole('alert')).toHaveTextContent('Add a full public link');
  },
};
export const SaveFailure: Story = {
  args: { endpoint: endpoint('failure') },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Save profile' }));
    await expect(await canvas.findByRole('alert')).toHaveTextContent('your entries are still here.');
    await expect(canvas.getByRole('textbox', { name: 'About your mentoring' })).toHaveValue(filled.description);
  },
};
export const ServerTechnologyError: Story = {
  args: { endpoint: endpoint('technology-error') },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Save profile' }));
    await expect(await canvas.findByRole('alert')).toHaveTextContent('Choose a supported technology.');
    await expect(canvas.getByRole('group', { name: 'Technologies and topics' })).toHaveFocus();
  },
};
export const Saved: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Save profile' }));
    await expect(await canvas.findByRole('status')).toHaveTextContent('Profile saved in this example.');
    await expect(args.onSaved).toHaveBeenCalled();
  },
};
export const Mobile: Story = { globals: { viewport: { value: 'mobile1', isRotated: false } } };
