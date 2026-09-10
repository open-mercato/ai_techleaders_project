// @vitest-environment jsdom

// Companion to CrudForm.test.tsx: that file drives the component with synthetic `fireEvent`
// dispatches, this one drives it the way a person does — real pointer, focus and key sequences
// from `@testing-library/user-event` — so the toolchain is proven against actual interaction.

import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { apiCall } from '../api/apiCall';
import type { ApiResult } from '../api/types';
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

const moneyField: CrudField = {
  name: 'price25',
  label: '25-minute price',
  type: 'money',
  currency: 'PLN',
  required: true,
  description: 'Allowed price: PLN 90 to 600.',
};
const moneySchema = z.object({
  price25: z.string().regex(/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/, 'Enter PLN 90 to 600 with no more than two decimal places.'),
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

  it('keeps money as an exact decimal string and visibly identifies the fixed currency', async () => {
    const user = userEvent.setup();
    render(<CrudForm schema={moneySchema} fields={[moneyField]} endpoint="/api/mentors/me/prices"
      method="PUT" initialValues={{ price25: 90 }} submitLabel="Save prices" />);

    const price = screen.getByRole<HTMLInputElement>('textbox', { name: /25-minute price/ });
    expect(price.type).toBe('text');
    expect(price.inputMode).toBe('decimal');
    expect(price.value).toBe('90');
    expect(screen.getByText('PLN').getAttribute('aria-hidden')).toBe('true');
    const guidance = price.getAttribute('aria-describedby')!;
    expect(document.getElementById(guidance)?.textContent).toBe(
      'Allowed price: PLN 90 to 600. Currency: PLN.',
    );

    await user.clear(price);
    await user.type(price, '090.10');
    expect(price.value).toBe('090.10');
    await user.click(screen.getByRole('button', { name: 'Save prices' }));
    expect(request).not.toHaveBeenCalled();
    expect(price.value).toBe('090.10');
    expect(price.getAttribute('aria-describedby')?.split(' ')).toHaveLength(2);

    await user.clear(price);
    await user.type(price, '90.10');
    await user.click(screen.getByRole('button', { name: 'Save prices' }));
    expect(request).toHaveBeenCalledExactlyOnceWith('/api/mentors/me/prices', {
      method: 'PUT',
      body: { price25: '90.10' },
    });
  });

  it('keeps an empty money control as an empty string for schema feedback', async () => {
    const user = userEvent.setup();
    render(<CrudForm schema={moneySchema} fields={[moneyField]} endpoint="/api/mentors/me/prices" />);
    const price = screen.getByRole<HTMLInputElement>('textbox', { name: /25-minute price/ });
    expect(price.value).toBe('');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(price.value).toBe('');
    expect(screen.getByText('Enter PLN 90 to 600 with no more than two decimal places.')).toBeTruthy();
    expect(request).not.toHaveBeenCalled();
  });

  it('preserves the money string through server and network failures', async () => {
    const user = userEvent.setup();
    request.mockResolvedValueOnce({
      ok: false,
      error: {
        code: 'validation_failed',
        message: 'Price refused.',
        fieldErrors: { price25: ['Use a price no higher than PLN 600.'] },
      },
    }).mockRejectedValueOnce(new Error('offline'));
    render(<CrudForm schema={moneySchema} fields={[moneyField]} endpoint="/api/mentors/me/prices"
      initialValues={{ price25: '600.00' }} />);
    const price = screen.getByRole<HTMLInputElement>('textbox', { name: /25-minute price/ });

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText('Use a price no higher than PLN 600.')).toBeTruthy();
    expect(price.value).toBe('600.00');
    expect(document.activeElement).toBe(price);
    expect(price.getAttribute('aria-describedby')?.split(' ')).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(await screen.findByText(/your entries are still here/)).toBeTruthy();
    expect(screen.queryByText('Use a price no higher than PLN 600.')).toBeNull();
    expect(price.value).toBe('600.00');
    expect(price.disabled).toBe(false);
  });

  it('locks money editing and cancellation while a keyboard submission is pending', async () => {
    const user = userEvent.setup();
    let complete!: (result: ApiResult<unknown>) => void;
    request.mockReturnValue(new Promise((resolve) => { complete = resolve; }));
    const onCancel = vi.fn();
    const onSuccess = vi.fn();
    render(<CrudForm schema={moneySchema} fields={[moneyField]} endpoint="/api/mentors/me/prices"
      initialValues={{ price25: '90.00' }} onCancel={onCancel} onSuccess={onSuccess} />);
    const price = screen.getByRole<HTMLInputElement>('textbox', { name: /25-minute price/ });
    price.focus();

    await user.keyboard('{Control>}{Enter}{/Control}');
    expect(request).toHaveBeenCalledOnce();
    expect(price.disabled).toBe(true);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Saving…' }).disabled).toBe(true);
    await user.keyboard('{Escape}');
    expect(onCancel).not.toHaveBeenCalled();

    await act(async () => complete({ ok: true, data: { saved: true } }));
    expect(price.disabled).toBe(false);
    expect(price.value).toBe('90.00');
    expect(onSuccess).toHaveBeenCalledWith({ saved: true });
    price.focus();
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledOnce();
  });
});
