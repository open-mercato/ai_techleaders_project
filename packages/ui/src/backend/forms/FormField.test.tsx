// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { Input } from '../../components/ui/input';
import { FormField } from './FormField';

afterEach(cleanup);

describe('FormField', () => {
  it('focuses its input through the visible label and updates validation after user input', async () => {
    const user = userEvent.setup();
    function RequiredName() {
      const [value, setValue] = useState('');
      return <FormField label="Display name" required description="Shown on your profile." error={value ? undefined : 'Enter your name.'}>
        {control => <Input {...control} value={value} onChange={event => setValue(event.target.value)} />}
      </FormField>;
    }
    render(<RequiredName />);
    const control = screen.getByRole('textbox', { name: 'Display name' });
    await user.click(screen.getByText('Display name'));
    expect(document.activeElement).toBe(control);
    expect(screen.getByRole('alert').textContent).toBe('Enter your name.');
    await user.type(control, 'Ada');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(control.getAttribute('aria-invalid')).toBe('false');
    expect(control.getAttribute('aria-describedby')).toBe(`${control.id}-description`);
  });

  it('generates independent IDs and associates labels with their controls', () => {
    render(<>
      <FormField label="First name">{control => <Input {...control} />}</FormField>
      <FormField label="Second name">{control => <Input {...control} />}</FormField>
    </>);
    const first = screen.getByLabelText('First name');
    const second = screen.getByLabelText('Second name');
    expect(first.id).not.toBe(second.id);
    expect(document.getElementById(first.id)).toBe(first);
    expect(first.getAttribute('aria-invalid')).toBe('false');
    expect(first.getAttribute('aria-required')).toBe('false');
    expect(first.hasAttribute('aria-describedby')).toBe(false);
  });

  it('uses an explicit ID and connects both helper and error text', () => {
    render(<FormField id="work-link" label="Public work" description="Use a public URL." error="The URL is incomplete." required>
      {control => <Input {...control} />}
    </FormField>);
    const control = screen.getByLabelText(/Public work/);
    expect(control.id).toBe('work-link');
    expect(control.getAttribute('aria-required')).toBe('true');
    expect(control.getAttribute('aria-invalid')).toBe('true');
    expect(control.getAttribute('aria-describedby')).toBe('work-link-description work-link-error');
    expect(document.getElementById('work-link-description')?.textContent).toBe('Use a public URL.');
    expect(screen.getByRole('alert').textContent).toBe('The URL is incomplete.');
    expect(screen.getByText('*').getAttribute('aria-hidden')).toBe('true');
  });

  it('updates the error relationship when a field is corrected', () => {
    const { rerender } = render(<FormField label="Name" error="Enter a name.">{control => <Input {...control} />}</FormField>);
    const control = screen.getByLabelText('Name');
    expect(control.getAttribute('aria-describedby')).toBe(`${control.id}-error`);
    rerender(<FormField label="Name" description="Your public display name.">{props => <Input {...props} />}</FormField>);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(control.getAttribute('aria-invalid')).toBe('false');
    expect(control.getAttribute('aria-describedby')).toBe(`${control.id}-description`);
  });
});
