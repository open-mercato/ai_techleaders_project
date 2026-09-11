// @vitest-environment jsdom

// Companion to CrudForm.test.tsx: that file drives the component with synthetic `fireEvent`
// dispatches, this one drives it the way a person does — real pointer, focus and key sequences
// from `@testing-library/user-event` — so the toolchain is proven against actual interaction.

import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { apiCall } from '../api/apiCall';
import { CrudForm, type CrudField } from './CrudForm';

vi.mock('../api/apiCall', () => ({ apiCall: vi.fn() }));

const request = vi.mocked(apiCall);

const fields: CrudField[] = [
  { name: 'name', label: 'Name' },
  { name: 'available', label: 'Available', type: 'checkbox' },
  {
    name: 'stack',
    label: 'Stack',
    type: 'select',
    placeholder: 'Choose a stack',
    options: [{ label: 'React', value: 'react' }, { label: 'Python', value: 'python' }],
  },
];

const schema = z.object({
  name: z.string().min(1, 'Enter a name.'),
  available: z.boolean(),
  stack: z.string().min(1, 'Choose a stack.'),
});

beforeEach(() => {
  request.mockReset();
  request.mockResolvedValue({ ok: true, data: { id: 'created' } });
});

afterEach(cleanup);

describe('CrudForm under real user interaction', () => {
  it('reports validation on a real click, then accepts typed, toggled and selected values', async () => {
    const user = userEvent.setup();
    const onSuccess = vi.fn();
    render(<CrudForm schema={schema} fields={fields} endpoint="/api/mentors" onSuccess={onSuccess} />);

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(request).not.toHaveBeenCalled();
    expect(screen.getAllByRole('alert').map((alert) => alert.textContent)).toEqual([
      'Enter a name.',
      'Choose a stack.',
    ]);
    expect(document.activeElement).toBe(screen.getByLabelText('Name'));

    await user.type(screen.getByLabelText('Name'), 'Ada Lovelace');
    await user.click(screen.getByLabelText('Available'));
    await user.selectOptions(screen.getByLabelText('Stack'), 'react');

    expect(screen.getByLabelText<HTMLInputElement>('Name').value).toBe('Ada Lovelace');
    expect(screen.getByLabelText<HTMLInputElement>('Available').checked).toBe(true);

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(request).toHaveBeenCalledExactlyOnceWith('/api/mentors', {
      method: 'POST',
      body: { name: 'Ada Lovelace', available: true, stack: 'react' },
    });
    expect(onSuccess).toHaveBeenCalledExactlyOnceWith({ id: 'created' });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('reaches Cancel before Save with the Tab key and honours the documented shortcuts', async () => {
    const user = userEvent.setup();
    const onCancel = vi.fn();
    render(<CrudForm schema={z.object({ name: z.string() })} fields={[{ name: 'name', label: 'Name' }]}
      endpoint="/api/profile" onCancel={onCancel} />);

    await user.tab();
    expect(document.activeElement).toBe(screen.getByLabelText('Name'));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
    await user.tab();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Save' }));

    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(request).toHaveBeenCalledExactlyOnceWith('/api/profile', { method: 'POST', body: { name: '' } });

    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
