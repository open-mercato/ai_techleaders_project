// @vitest-environment jsdom
import { createRef } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Checkbox } from './checkbox';
import { Input } from './input';
import { Label } from './label';
import { RadioGroup, RadioGroupItem } from './radio-group';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue } from './select';
import { Switch } from './switch';
import { Textarea } from './textarea';

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn(() => false);
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
});
afterEach(cleanup);

describe('text controls', () => {
  it('retains native type, change events, labels, ref and density semantics', () => {
    const ref = createRef<HTMLInputElement>();
    const change = vi.fn();
    render(<><Label htmlFor="email" className="custom-label">Email</Label><Input id="email" ref={ref} type="email" className="custom-input" onChange={change} placeholder="you@example.com" />
      <Input aria-label="Compact" fieldSize="xs" disabled />
      <Input aria-label="Small" fieldSize="sm" readOnly value="Reserved" />
    </>);
    const email = screen.getByLabelText<HTMLInputElement>('Email');
    expect(ref.current).toBe(email);
    expect(email.type).toBe('email');
    expect(email.dataset.fieldSize).toBe('md');
    expect(email.className).toBe('dm-input custom-input');
    expect(screen.getByText('Email').className).toBe('dm-field-label custom-label');
    fireEvent.change(email, { target: { value: 'ada@example.com' } });
    expect(change).toHaveBeenCalledOnce();
    expect(email.value).toBe('ada@example.com');
    expect(screen.getByLabelText<HTMLInputElement>('Compact').disabled).toBe(true);
    expect(screen.getByLabelText('Compact').getAttribute('data-field-size')).toBe('xs');
    expect(screen.getByLabelText<HTMLInputElement>('Small').readOnly).toBe(true);
  });

  it('forwards textarea value, constraints, ARIA relationships and refs', () => {
    const ref = createRef<HTMLTextAreaElement>();
    const change = vi.fn();
    render(<><Label htmlFor="answer">Written answer</Label><Textarea id="answer" ref={ref} rows={6} maxLength={2000} onChange={change}
      className="custom-textarea" aria-invalid="true" aria-describedby="answer-error" />
      <p id="answer-error">Add an answer.</p><Textarea aria-label="Read only" readOnly defaultValue="Saved answer" />
      <Textarea aria-label="Disabled" disabled />
    </>);
    const textarea = screen.getByLabelText<HTMLTextAreaElement>('Written answer');
    expect(ref.current).toBe(textarea);
    expect(textarea.rows).toBe(6);
    expect(textarea.maxLength).toBe(2000);
    expect(textarea.className).toBe('dm-input dm-textarea custom-textarea');
    expect(textarea.getAttribute('aria-describedby')).toBe('answer-error');
    fireEvent.change(textarea, { target: { value: 'Use a stable key.' } });
    expect(change).toHaveBeenCalledOnce();
    expect(textarea.value).toBe('Use a stable key.');
    expect(screen.getByLabelText<HTMLTextAreaElement>('Read only').readOnly).toBe(true);
    expect(screen.getByLabelText<HTMLTextAreaElement>('Disabled').disabled).toBe(true);
  });
});

describe('choice controls', () => {
  it('toggles a checkbox by label and keyboard and exposes a mixed state', async () => {
    const user = userEvent.setup();
    const changed = vi.fn();
    const ref = createRef<HTMLButtonElement>();
    render(<><Checkbox id="typescript" ref={ref} onCheckedChange={changed} /><Label htmlFor="typescript">TypeScript</Label>
      <Checkbox aria-label="Mixed selection" defaultChecked="indeterminate" size="sm" className="compact-choice" />
      <Checkbox aria-label="Disabled choice" disabled defaultChecked />
    </>);
    const control = screen.getByRole('checkbox', { name: 'TypeScript' });
    expect(ref.current).toBe(control);
    expect(control.getAttribute('data-size')).toBe('md');
    await user.click(screen.getByText('TypeScript'));
    expect(control.getAttribute('aria-checked')).toBe('true');
    expect(changed).toHaveBeenLastCalledWith(true);
    control.focus();
    await user.keyboard(' ');
    expect(control.getAttribute('aria-checked')).toBe('false');
    expect(changed).toHaveBeenLastCalledWith(false);
    const mixed = screen.getByRole('checkbox', { name: 'Mixed selection' });
    expect(mixed.getAttribute('aria-checked')).toBe('mixed');
    expect(mixed.className).toContain('compact-choice');
    await user.click(mixed);
    expect(mixed.getAttribute('aria-checked')).toBe('true');
    await user.click(screen.getByRole('checkbox', { name: 'Disabled choice' }));
    expect(screen.getByRole('checkbox', { name: 'Disabled choice' }).getAttribute('aria-checked')).toBe('true');
  });

  it('moves radio selection with arrow keys while skipping disabled choices', async () => {
    const user = userEvent.setup();
    const changed = vi.fn();
    const ref = createRef<HTMLButtonElement>();
    render(<RadioGroup aria-label="Session length" defaultValue="25" onValueChange={changed} className="duration-options">
      <RadioGroupItem ref={ref} value="25" aria-label="25 minutes" />
      <RadioGroupItem value="unavailable" aria-label="Unavailable" disabled />
      <RadioGroupItem value="50" aria-label="50 minutes" className="long-session" />
    </RadioGroup>);
    const first = screen.getByRole('radio', { name: '25 minutes' });
    expect(ref.current).toBe(first);
    expect(screen.getByRole('radiogroup').className).toBe('dm-radio-group duration-options');
    first.focus();
    await user.keyboard('{ArrowDown>}');
    await waitFor(() => expect(screen.getByRole('radio', { name: '50 minutes' }).getAttribute('aria-checked')).toBe('true'));
    expect(screen.getByRole('radio', { name: '50 minutes' }).className).toContain('long-session');
    expect(changed).toHaveBeenLastCalledWith('50');
    await user.keyboard('{/ArrowDown}');
    expect(screen.getByRole('radio', { name: 'Unavailable' }).getAttribute('aria-checked')).toBe('false');
  });

  it('toggles switches with keyboard, forwards state and respects disabled', async () => {
    const user = userEvent.setup();
    const changed = vi.fn();
    const ref = createRef<HTMLButtonElement>();
    render(<><Switch ref={ref} aria-label="Show past sessions" onCheckedChange={changed} className="setting" />
      <Switch aria-label="Small setting" size="sm" defaultChecked />
      <Switch aria-label="Unavailable setting" disabled />
    </>);
    const control = screen.getByRole('switch', { name: 'Show past sessions' });
    expect(ref.current).toBe(control);
    expect(control.className).toBe('dm-switch setting');
    expect(control.getAttribute('data-size')).toBe('default');
    control.focus();
    await user.keyboard(' ');
    expect(control.getAttribute('aria-checked')).toBe('true');
    expect(changed).toHaveBeenLastCalledWith(true);
    await user.keyboard(' ');
    expect(control.getAttribute('aria-checked')).toBe('false');
    expect(screen.getByRole('switch', { name: 'Small setting' }).getAttribute('data-size')).toBe('sm');
    await user.click(screen.getByRole('switch', { name: 'Unavailable setting' }));
    expect(screen.getByRole('switch', { name: 'Unavailable setting' }).getAttribute('aria-checked')).toBe('false');
  });
});

function SelectExample({ position, size, disabled, onValueChange }: {
  position?: 'popper' | 'item-aligned'; size?: 'default' | 'sm'; disabled?: boolean; onValueChange?: (value: string) => void;
}) {
  return <Select defaultValue="typescript" disabled={disabled} onValueChange={onValueChange}>
    <SelectTrigger aria-label="Stack" size={size} className="stack-trigger"><SelectValue placeholder="Choose a stack" /></SelectTrigger>
    {/* jsdom has no clipping geometry. Browser checks cover collision positioning. */}
    <SelectContent position={position} avoidCollisions={false} className="stack-popup">
      <SelectGroup><SelectLabel className="stack-label">Languages</SelectLabel>
        <SelectItem value="typescript" className="stack-option">TypeScript</SelectItem>
        <SelectItem value="python">Python</SelectItem>
      </SelectGroup>
      <SelectSeparator className="stack-separator" />
      <SelectGroup><SelectLabel>Frameworks</SelectLabel><SelectItem value="react" disabled>React unavailable</SelectItem></SelectGroup>
    </SelectContent>
  </Select>;
}

describe('Select', () => {
  it('opens from the keyboard, supports labeled groups and commits a selection', async () => {
    const user = userEvent.setup();
    const changed = vi.fn();
    render(<SelectExample onValueChange={changed} />);
    const trigger = screen.getByRole('combobox', { name: 'Stack' });
    expect(trigger.className).toBe('dm-input dm-select-trigger stack-trigger');
    expect(trigger.getAttribute('data-size')).toBe('default');
    trigger.focus();
    await user.keyboard('{Enter}');
    const list = await screen.findByRole('listbox');
    expect(list.className).toBe('dm-select-content stack-popup');
    expect(screen.getByRole('group', { name: 'Languages' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'React unavailable' }).getAttribute('aria-disabled')).toBe('true');
    await user.keyboard('{ArrowDown}{Enter}');
    await waitFor(() => expect(changed).toHaveBeenCalledWith('python'));
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(trigger.textContent).toBe('Python');
  });

  it('supports popper sizing and closes on Escape without changing value', () => {
    const changed = vi.fn();
    render(<SelectExample position="popper" size="sm" onValueChange={changed} />);
    const trigger = screen.getByRole('combobox', { name: 'Stack' });
    expect(trigger.getAttribute('data-size')).toBe('sm');
    trigger.focus();
    fireEvent.keyDown(trigger, { key: 'Enter' });
    const list = screen.getByRole('listbox', { hidden: true });
    expect(list.className).toContain('dm-select-popper');
    expect(list.querySelector('.dm-select-viewport-popper')).toBeTruthy();
    fireEvent.keyDown(list, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(changed).not.toHaveBeenCalled();
  });

  it('restores keyboard focus to the trigger when a selection is dismissed', async () => {
    const user = userEvent.setup();
    render(<SelectExample />);
    const trigger = screen.getByRole('combobox', { name: 'Stack' });
    trigger.focus();
    await user.keyboard('{Enter}');
    await screen.findByRole('listbox');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(document.activeElement === trigger).toBe(true));
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(trigger.textContent).toBe('TypeScript');
  });

  it('does not open a disabled select', async () => {
    const user = userEvent.setup();
    render(<SelectExample disabled />);
    const trigger = screen.getByRole<HTMLButtonElement>('combobox', { name: 'Stack' });
    expect(trigger.disabled).toBe(true);
    await user.click(trigger);
    expect(screen.queryByRole('listbox')).toBeNull();
  });
});
