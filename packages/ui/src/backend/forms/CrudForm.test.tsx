// @vitest-environment jsdom

import { act, cleanup, createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { apiCall } from '../api/apiCall';
import type { ApiResult } from '../api/types';
import { CrudForm, type CrudField } from './CrudForm';

vi.mock('../api/apiCall', () => ({ apiCall: vi.fn() }));

const request = vi.mocked(apiCall);
const textFields: CrudField[] = [{ name: 'name', label: 'Name' }];
const textSchema = z.object({ name: z.string() });
const allFields: CrudField[] = [
  { name: 'name', label: 'Name', placeholder: 'Your name' },
  { name: 'headline', label: 'Headline', type: 'text' },
  { name: 'email', label: 'Email', type: 'email' },
  { name: 'price', label: 'Price', type: 'number' },
  { name: 'description', label: 'Description', type: 'textarea', placeholder: 'Your experience' },
  { name: 'available', label: 'Available', type: 'checkbox' },
  {
    name: 'stack', label: 'Stack', type: 'select', placeholder: 'Choose a stack',
    options: [{ label: 'React', value: 'react' }, { label: 'Python', value: 'python' }],
  },
];
const allSchema = z.object({
  name: z.string(), headline: z.string(), email: z.string(), price: z.number().optional(),
  description: z.string(), available: z.boolean(), stack: z.string(),
});

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
});

function input(label: string) {
  return screen.getByLabelText<HTMLInputElement>(label);
}

function submitForm() {
  const form = screen.getByRole('button', { name: 'Save' }).closest('form');
  if (!form) throw new Error('The save action must belong to a form');
  return fireEvent.submit(form);
}

beforeEach(() => {
  request.mockReset();
  request.mockResolvedValue({ ok: true, data: { id: 'created' } });
});

afterEach(cleanup);

describe('CrudForm', () => {
  it('keeps a custom control in the schema, error focus and request lifecycle', async () => {
    const onSuccess = vi.fn();
    render(<CrudForm schema={z.object({ topics: z.array(z.string()).min(1, 'Choose a topic.') })}
      fields={[{ name: 'topics', label: 'Topics', required: true, description: 'Choose all that apply.', render: ({ inputProps, labelId, value, onChange }) =>
        <fieldset id={inputProps.id} disabled={inputProps.disabled} aria-labelledby={labelId}
          aria-invalid={inputProps['aria-invalid']} aria-describedby={inputProps['aria-describedby']} tabIndex={-1}>
          <label><input type="checkbox" checked={(value as string[]).includes('React')} onChange={event => onChange(event.target.checked ? ['React'] : [])} />React</label>
        </fieldset> }]}
      initialValues={{ topics: [] }} endpoint="/api/topics" onSuccess={onSuccess} />);
    const group = screen.getByRole('group', { name: 'Topics' });
    submitForm();
    expect(document.activeElement).toBe(group);
    expect(group.getAttribute('aria-describedby')).toContain(screen.getByRole('alert').id);
    expect(request).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('checkbox', { name: 'React' }));
    submitForm();
    await waitFor(() => expect(onSuccess).toHaveBeenCalledOnce());
    expect(request).toHaveBeenCalledWith('/api/topics', { method: 'POST', body: { topics: ['React'] } });
    expect(group.getAttribute('aria-invalid')).toBe('false');
  });

  it('reports pending request transitions without announcing client validation as a submission', async () => {
    const onSubmittingChange = vi.fn();
    render(<CrudForm schema={z.object({ name: z.string().min(1, 'Enter a name.') })}
      fields={textFields} endpoint="/api/profile" onSubmittingChange={onSubmittingChange} />);
    submitForm();
    expect(onSubmittingChange).not.toHaveBeenCalled();
    fireEvent.change(input('Name'), { target: { value: 'Ada' } });
    submitForm();
    await waitFor(() => expect(onSubmittingChange.mock.calls).toEqual([[true], [false]]));
    request.mockRejectedValueOnce(new Error('Connection interrupted'));
    submitForm();
    await screen.findByRole('alert');
    expect(onSubmittingChange.mock.calls).toEqual([[true], [false], [true], [false]]);
  });

  it('keeps field guidance associated with its control before and after validation and supplies autocomplete', () => {
    render(<CrudForm schema={z.object({ password: z.string().min(12, 'This password is too short.') })}
      fields={[{ name: 'password', label: 'Password', type: 'password', autoComplete: 'new-password', description: 'Use at least 12 characters.' }]}
      endpoint="/api/register" />);
    const password = input('Password');
    expect(password.autocomplete).toBe('new-password');
    const descriptionId = password.getAttribute('aria-describedby')!;
    expect(document.getElementById(descriptionId)?.textContent).toBe('Use at least 12 characters.');
    submitForm();
    const references = password.getAttribute('aria-describedby')!.split(' ');
    expect(references[0]).toBe(descriptionId);
    expect(references.map(id => document.getElementById(id)?.textContent)).toEqual(['Use at least 12 characters.', 'This password is too short.']);
    expect(document.activeElement).toBe(password);
  });

  it('focuses the first invalid control after submit without stealing focus while editing', () => {
    render(<CrudForm schema={z.object({ name: z.string().min(1, 'Enter your name.'), email: z.email('Enter a valid email.') })}
      fields={[{ name: 'name', label: 'Name' }, { name: 'email', label: 'Email', type: 'email' }]} endpoint="/api/profile" />);
    const save = screen.getByRole('button', { name: 'Save' });
    save.focus();
    fireEvent.click(save);
    expect(document.activeElement).toBe(input('Name'));
    input('Email').focus();
    fireEvent.change(input('Email'), { target: { value: 'ada@example.com' } });
    expect(document.activeElement).toBe(input('Email'));
    fireEvent.change(input('Name'), { target: { value: 'Ada' } });
    fireEvent.change(input('Email'), { target: { value: '' } });
    fireEvent.click(save);
    expect(document.activeElement).toBe(input('Email'));
  });

  it('focuses a root validation alert when there is no invalid field', () => {
    render(<CrudForm schema={textSchema.refine(() => false, 'These settings conflict.')} fields={textFields} endpoint="/api/profile" />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const alert = screen.getByRole('alert');
    expect(alert.tabIndex).toBe(-1);
    expect(document.activeElement).toBe(alert);
  });

  it('focuses returned server field errors and a general failure after requests finish', async () => {
    request.mockResolvedValueOnce({ ok: false, error: { code: 'validation', message: 'Invalid name', fieldErrors: { name: ['This name is unavailable.'] } } });
    render(<CrudForm schema={textSchema} fields={textFields} endpoint="/api/profile" />);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await screen.findByText('This name is unavailable.');
    expect(input('Name').disabled).toBe(false);
    expect(document.activeElement).toBe(input('Name'));
    request.mockResolvedValueOnce({ ok: false, error: { code: 'unavailable', message: 'Try again later.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    const alert = await screen.findByText('Try again later.');
    await waitFor(() => expect(document.activeElement).toBe(alert));
  });

  it('associates and focuses field errors supplied by a related transition', () => {
    const props = {
      schema: textSchema,
      fields: textFields,
      endpoint: '/api/profile',
      initialValues: { name: 'Ada' },
    };
    const { rerender } = render(<CrudForm {...props} />);
    rerender(<CrudForm {...props} externalFieldErrors={{ name: ['Add your public name.'] }} />);
    const name = input('Name');
    expect(name.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(name.getAttribute('aria-describedby')!)?.textContent).toBe('Add your public name.');
    expect(document.activeElement).toBe(name);

    rerender(<CrudForm {...props} externalFieldErrors={{ _root: ['Complete the missing details.'] }} />);
    expect(document.activeElement).toBe(screen.getByText('Complete the missing details.').closest('[role="alert"]'));
    rerender(<CrudForm {...props} externalFieldErrors={{ name: [] }} />);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('marks required fields visibly and semantically while validating with the schema', () => {
    render(<CrudForm schema={z.object({ name: z.string().min(1, 'Enter a name.') })}
      fields={[{ name: 'name', label: 'Name', required: true }]} endpoint="/api/profile" />);
    const control = screen.getByRole<HTMLInputElement>('textbox', { name: 'Name' });
    expect(control.required).toBe(true);
    expect(control.getAttribute('aria-required')).toBe('true');
    expect(screen.getByText('*').getAttribute('aria-hidden')).toBe('true');
    submitForm();
    expect(screen.getByRole('alert').textContent).toBe('Enter a name.');
    expect(request).not.toHaveBeenCalled();
  });

  it('preserves native date and local date-time values without implicit timezone conversion', async () => {
    render(<CrudForm schema={z.object({ day: z.string(), startsAt: z.string() })}
      fields={[{ name: 'day', label: 'Day', type: 'date' }, { name: 'startsAt', label: 'Starts at', type: 'datetime-local' }]}
      initialValues={{ day: '2026-09-07', startsAt: '2026-09-07T14:30' }} endpoint="/api/availability" />);
    expect(input('Day').type).toBe('date');
    expect(input('Starts at').type).toBe('datetime-local');
    expect(input('Starts at').value).toBe('2026-09-07T14:30');
    fireEvent.change(input('Day'), { target: { value: '2026-09-08' } });
    fireEvent.change(input('Starts at'), { target: { value: '2026-09-08T15:00' } });
    submitForm();
    await waitFor(() => expect(request).toHaveBeenCalledWith('/api/availability', {
      method: 'POST', body: { day: '2026-09-08', startsAt: '2026-09-08T15:00' },
    }));
  });

  it('renders all field types with empty defaults and submits the schema output with POST', async () => {
    render(<CrudForm schema={allSchema} fields={allFields} endpoint="/api/mentors" />);

    expect(input('Name').type).toBe('text');
    expect(input('Name').placeholder).toBe('Your name');
    expect(input('Headline').type).toBe('text');
    expect(input('Email').type).toBe('email');
    expect(input('Price').type).toBe('number');
    for (const label of ['Name', 'Headline', 'Email', 'Price', 'Description', 'Stack']) {
      expect(input(label).value).toBe('');
    }
    expect(input('Available').checked).toBe(false);
    expect(screen.getByRole<HTMLOptionElement>('option', { name: 'Choose a stack' }).disabled).toBe(true);
    expect(screen.getAllByRole('option').map((option) => option.textContent)).toEqual([
      'Choose a stack', 'React', 'Python',
    ]);
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    expect(submitForm()).toBe(false);

    await waitFor(() => expect(request).toHaveBeenCalledWith('/api/mentors', {
      method: 'POST',
      body: { name: '', headline: '', email: '', price: undefined, description: '', available: false, stack: '' },
    }));
    await waitFor(() => expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Save' }).disabled).toBe(false));
  });

  it('preserves supplied values, substitutes defaults for nullish values, and updates each input kind', async () => {
    const onSuccess = vi.fn();
    render(<CrudForm schema={allSchema} fields={allFields} endpoint="/api/mentors/me" method="PUT"
      initialValues={{ name: 'Ada', headline: null, email: 'ada@example.com', price: 50, description: 'Systems', available: true, stack: 'react' }}
      submitLabel="Update profile" onSuccess={onSuccess} />);

    expect(input('Name').value).toBe('Ada');
    expect(input('Headline').value).toBe('');
    expect(input('Email').value).toBe('ada@example.com');
    expect(input('Price').value).toBe('50');
    expect(input('Description').value).toBe('Systems');
    expect(input('Available').checked).toBe(true);
    expect(input('Stack').value).toBe('react');

    fireEvent.change(input('Name'), { target: { value: 'Grace' } });
    fireEvent.change(input('Email'), { target: { value: 'grace@example.com' } });
    fireEvent.change(input('Price'), { target: { value: '75.5' } });
    fireEvent.change(input('Description'), { target: { value: 'Compilers' } });
    fireEvent.click(input('Available'));
    fireEvent.change(input('Stack'), { target: { value: 'python' } });
    fireEvent.click(screen.getByRole('button', { name: 'Update profile' }));

    await waitFor(() => expect(request).toHaveBeenCalledWith('/api/mentors/me', {
      method: 'PUT', body: {
        name: 'Grace', headline: '', email: 'grace@example.com', price: 75.5,
        description: 'Compilers', available: false, stack: 'python',
      },
    }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalledExactlyOnceWith({ id: 'created' }));
  });

  it('renders a multiselect as an accessible checkbox group and submits selected option values', async () => {
    render(<CrudForm schema={z.object({ stackTags: z.array(z.string()) })} endpoint="/api/mentors/me"
      fields={[{
        name: 'stackTags', label: 'Technology stacks', type: 'multiselect',
        description: 'Choose up to four.',
        options: [
          { label: 'TypeScript', value: 'typescript' },
          { label: 'React', value: 'react' },
        ],
      }]}
      initialValues={{ stackTags: 'invalid stored value' }} />);

    const group = screen.getByRole('group', { name: 'Technology stacks' });
    expect(group.getAttribute('aria-describedby')).toBeTruthy();
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    fireEvent.click(screen.getByRole('checkbox', { name: 'TypeScript' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'React' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'TypeScript' }));
    submitForm();

    await waitFor(() => expect(request).toHaveBeenCalledWith('/api/mentors/me', {
      method: 'POST', body: { stackTags: ['react'] },
    }));
  });

  it('defaults a multiselect to an empty array and permits a field with no options', async () => {
    render(<CrudForm schema={z.object({ stackTags: z.array(z.string()) })} endpoint="/api/mentors/me"
      fields={[{ name: 'stackTags', label: 'Technology stacks', type: 'multiselect' }]} />);
    expect(screen.getByRole('group', { name: 'Technology stacks' }).children).toHaveLength(0);
    submitForm();
    await waitFor(() => expect(request).toHaveBeenCalledWith('/api/mentors/me', {
      method: 'POST', body: { stackTags: [] },
    }));
  });

  it('coerces a cleared numeric field to undefined and lets the schema supply its default', async () => {
    render(<CrudForm schema={z.object({ price: z.number().default(25) })}
      fields={[{ name: 'price', label: 'Price', type: 'number' }]}
      endpoint="/api/prices" initialValues={{ price: 50 }} />);
    fireEvent.change(input('Price'), { target: { value: '' } });
    expect(input('Price').value).toBe('');
    submitForm();
    await waitFor(() => expect(request).toHaveBeenCalledWith('/api/prices', { method: 'POST', body: { price: 25 } }));
  });

  it('renders newly introduced fields as empty and supports a select with no options or placeholder', () => {
    const { rerender } = render(<CrudForm schema={textSchema} fields={textFields} endpoint="/api/profile" />);
    rerender(<CrudForm schema={z.record(z.string(), z.unknown())} endpoint="/api/profile" fields={[
      { name: 'bio', label: 'Biography', type: 'textarea' },
      { name: 'stack', label: 'Stack', type: 'select' },
      { name: 'title', label: 'Title' },
    ]} />);
    expect(input('Biography').value).toBe('');
    expect(input('Stack').value).toBe('');
    expect(input('Title').value).toBe('');
    expect(screen.getByRole<HTMLOptionElement>('option', { name: 'Select…' }).disabled).toBe(true);
  });

  it('uses the production Align field hooks without conflicting geometry utilities', () => {
    render(<CrudForm schema={allSchema} fields={allFields} endpoint="/api/profile" />);
    const form = input('Name').closest('form');
    expect(form?.className).toBe('dm-form');
    expect(input('Name').parentElement?.className).toBe('dm-field');
    expect(screen.getByText('Name').className).toBe('dm-field-label');
    expect(input('Name').className).toBe('dm-input w-full');
    expect(input('Stack').className).toBe('dm-input w-full');
    expect(input('Description').className).toBe('dm-input dm-textarea w-full');
    expect(input('Available').className).toBe('dm-checkbox');
    expect(screen.getByRole('button', { name: 'Save' }).parentElement?.className).toBe('dm-form-actions');
  });

  it('groups repeated and nested validation errors and refuses submission on root-level issues', () => {
    const schema = z.record(z.string(), z.unknown()).superRefine((_value, context) => {
      context.addIssue({ code: 'custom', path: ['name'], message: 'Name is required' });
      context.addIssue({ code: 'custom', path: ['name'], message: 'Use your full name' });
      context.addIssue({ code: 'custom', path: ['profile', 'name'], message: 'Profile name is required' });
      context.addIssue({ code: 'custom', path: [], message: 'The form is incomplete' });
    });
    render(<CrudForm schema={schema} fields={[
      ...textFields, { name: 'profile.name', label: 'Profile name' },
    ]} endpoint="/api/profile" />);
    submitForm();
    expect(request).not.toHaveBeenCalled();
    for (const message of ['Name is required', 'Use your full name', 'Profile name is required']) {
      expect(screen.getByText(message).className).toBe('dm-field-error');
    }
    expect(screen.getByText('The form is incomplete').closest('[role="alert"]')).toBeTruthy();
    expect(input('Name').getAttribute('aria-invalid')).toBe('true');
    const describedBy = input('Name').getAttribute('aria-describedby');
    expect(document.getElementById(describedBy!)?.textContent).toContain('Name is required');
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Save' }).disabled).toBe(false);
  });

  it('clears validation errors after correction and posts transformed schema data', async () => {
    render(<CrudForm schema={z.object({ name: z.string().min(1, 'Enter a name').transform((name) => name.trim()) })}
      fields={textFields} endpoint="/api/profile" />);
    submitForm();
    expect(screen.getByText('Enter a name')).toBeTruthy();
    fireEvent.change(input('Name'), { target: { value: ' Ada ' } });
    submitForm();
    expect(screen.queryByText('Enter a name')).toBeNull();
    await waitFor(() => expect(request).toHaveBeenCalledWith('/api/profile', { method: 'POST', body: { name: 'Ada' } }));
  });

  it('disables actions while awaiting the response and restores them after success', async () => {
    let complete!: (result: ApiResult<unknown>) => void;
    request.mockReturnValue(new Promise((resolve) => { complete = resolve; }));
    const onSuccess = vi.fn();
    const onCancel = vi.fn();
    render(<CrudForm schema={textSchema} fields={textFields} endpoint="/api/profile"
      onSuccess={onSuccess} onCancel={onCancel} />);
    submitForm();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Saving…' }).disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Cancel' }).disabled).toBe(true);
    expect(onSuccess).not.toHaveBeenCalled();
    await act(async () => complete({ ok: true, data: { id: 'saved' } }));
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Save' }).disabled).toBe(false);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Cancel' }).disabled).toBe(false);
    expect(onSuccess).toHaveBeenCalledExactlyOnceWith({ id: 'saved' });
  });

  it('shows server field errors, accepts empty error lists, and preserves entered values', async () => {
    request.mockResolvedValue({ ok: false, error: {
      code: 'validation_error', message: 'Invalid profile', fieldErrors: { name: ['Name already used'], headline: [] },
    } });
    render(<CrudForm schema={z.object({ name: z.string(), headline: z.string() })}
      fields={allFields.slice(0, 2)} endpoint="/api/profile" initialValues={{ name: 'Ada' }} />);
    submitForm();
    await waitFor(() => expect(screen.getByText('Name already used').className).toBe('dm-field-error'));
    expect(screen.queryByText('Invalid profile')).toBeNull();
    expect(input('Name').value).toBe('Ada');
    expect(input('Headline').parentElement?.querySelector('.dm-field-error')).toBeNull();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Save' }).disabled).toBe(false);
  });

  it('shows a general API error and clears it when the submission is retried', async () => {
    request.mockResolvedValueOnce({ ok: false, error: { code: 'network_error', message: 'Connection lost' } });
    render(<CrudForm schema={textSchema} fields={textFields} endpoint="/api/profile" initialValues={{ name: 'Ada' }} />);
    submitForm();
    await waitFor(() => expect(screen.getByText('Connection lost').className).toBe('dm-form-error'));
    expect(input('Name').value).toBe('Ada');
    submitForm();
    expect(screen.queryByText('Connection lost')).toBeNull();
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  });

  it.each([{ metaKey: true }, { ctrlKey: true }])('submits on modified Enter (%j)', async (modifier) => {
    render(<CrudForm schema={textSchema} fields={textFields} endpoint="/api/profile" />);
    const event = createEvent.keyDown(input('Name'), { key: 'Enter', ...modifier });
    fireEvent(input('Name'), event);
    expect(event.defaultPrevented).toBe(true);
    await waitFor(() => expect(request).toHaveBeenCalledOnce());
  });

  it.each([
    { key: 'Enter' }, { key: 'a' }, { key: 'a', metaKey: true }, { key: 'a', ctrlKey: true }, { key: 'Escape' },
  ])('leaves unrelated keys and Escape without a cancel callback alone (%j)', (keys) => {
    render(<CrudForm schema={textSchema} fields={textFields} endpoint="/api/profile" />);
    const event = createEvent.keyDown(input('Name'), keys);
    fireEvent(input('Name'), event);
    expect(event.defaultPrevented).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });

  it('places Cancel before submit in keyboard order and cancels without submitting', () => {
    const onCancel = vi.fn();
    render(<CrudForm schema={textSchema} fields={textFields} endpoint="/api/profile" onCancel={onCancel} />);
    const [cancel, save] = screen.getAllByRole<HTMLButtonElement>('button');
    expect(cancel).toBe(screen.getByRole('button', { name: 'Cancel' }));
    expect(save).toBe(screen.getByRole('button', { name: 'Save' }));
    expect(cancel!.type).toBe('button');
    expect(save!.type).toBe('submit');
    expect(cancel!.tabIndex).toBe(0);
    expect(save!.tabIndex).toBe(0);
    fireEvent.click(cancel!);
    const event = createEvent.keyDown(input('Name'), { key: 'Escape' });
    fireEvent(input('Name'), event);
    expect(event.defaultPrevented).toBe(true);
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(request).not.toHaveBeenCalled();
  });

  it('isolates repeated field names across forms and associates each label and error correctly', async () => {
    const schema = z.object({ name: z.string().min(1, 'Enter a name') });
    const { container } = render(<>
      <CrudForm schema={schema} fields={textFields} endpoint="/api/first" />
      <CrudForm schema={schema} fields={textFields} endpoint="/api/second" />
    </>);
    const forms = container.querySelectorAll('form');
    const first = within(forms[0]!).getByLabelText<HTMLInputElement>('Name');
    const second = within(forms[1]!).getByLabelText<HTMLInputElement>('Name');
    expect(first.id).not.toBe(second.id);
    expect(document.getElementById(first.id)).toBe(first);
    expect(document.getElementById(second.id)).toBe(second);
    expect(first.getAttribute('aria-invalid')).toBe('false');
    expect(first.hasAttribute('aria-describedby')).toBe(false);
    fireEvent.submit(forms[1]!);
    expect(first.getAttribute('aria-invalid')).toBe('false');
    expect(second.getAttribute('aria-invalid')).toBe('true');
    expect(document.getElementById(second.getAttribute('aria-describedby')!)?.textContent).toBe('Enter a name');
    fireEvent.change(second, { target: { value: 'Ada' } });
    fireEvent.submit(forms[1]!);
    expect(second.hasAttribute('aria-describedby')).toBe(false);
    await waitFor(() => expect(request).toHaveBeenCalledWith('/api/second', { method: 'POST', body: { name: 'Ada' } }));
  });

  it('keeps root-level server validation visible with an alert', async () => {
    request.mockResolvedValue({ ok: false, error: {
      code: 'validation', message: 'Validation failed', fieldErrors: { _root: ['These settings conflict.'] },
    } });
    render(<CrudForm schema={textSchema} fields={textFields} endpoint="/api/profile" />);
    submitForm();
    expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'These settings conflict.');
  });

  it('handles an empty root error array without showing an empty alert', async () => {
    request.mockResolvedValue({ ok: false, error: { code: 'validation', message: '', fieldErrors: { _root: [] } } });
    render(<CrudForm schema={textSchema} fields={textFields} endpoint="/api/profile" />);
    submitForm();
    await waitFor(() => expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Save' }).disabled).toBe(false));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('prevents duplicate submissions synchronously and blocks keyboard cancellation during a request', async () => {
    let complete!: (result: ApiResult<unknown>) => void;
    request.mockReturnValue(new Promise((resolve) => { complete = resolve; }));
    const onCancel = vi.fn();
    render(<CrudForm schema={allSchema} fields={allFields} endpoint="/api/profile" onCancel={onCancel} />);
    const form = input('Name').closest('form')!;
    act(() => {
      fireEvent.submit(form);
      fireEvent.submit(form);
      fireEvent.keyDown(form, { key: 'Enter', ctrlKey: true });
      fireEvent.keyDown(form, { key: 'Enter', metaKey: true });
      fireEvent.keyDown(form, { key: 'Escape' });
    });
    expect(request).toHaveBeenCalledOnce();
    expect(onCancel).not.toHaveBeenCalled();
    expect(form.getAttribute('aria-busy')).toBe('true');
    for (const label of ['Name', 'Email', 'Price', 'Description', 'Available', 'Stack']) {
      expect(input(label).disabled).toBe(true);
    }
    await act(async () => complete({ ok: true, data: null }));
    expect(form.getAttribute('aria-busy')).toBe('false');
    fireEvent.keyDown(form, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledOnce();
    submitForm();
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  });

  it('recovers the pending lock and preserves input when a request rejects unexpectedly', async () => {
    request.mockRejectedValueOnce(new Error('Response stream interrupted'));
    render(<CrudForm schema={textSchema} fields={textFields} endpoint="/api/profile" initialValues={{ name: 'Ada' }} />);
    submitForm();
    const error = await screen.findByRole('alert');
    expect(error.textContent).toContain('your entries are still here');
    expect(input('Name').value).toBe('Ada');
    expect(input('Name').disabled).toBe(false);
    submitForm();
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('supports a password input without rendering the credential as plain text', async () => {
    render(<CrudForm schema={z.object({ password: z.string() })}
      fields={[{ name: 'password', label: 'Password', type: 'password' }]} endpoint="/api/login" />);
    expect(input('Password').type).toBe('password');
    fireEvent.change(input('Password'), { target: { value: 'sample-credential' } });
    submitForm();
    await waitFor(() => expect(request).toHaveBeenCalledWith('/api/login', { method: 'POST', body: { password: 'sample-credential' } }));
  });
});
