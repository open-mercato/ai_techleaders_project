// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { SessionComposer, SessionComposerClosed, composerCount } from './SessionComposer';

afterEach(cleanup);

it('counts what is left and what is over the limit', () => {
  expect(composerCount(0, 4000)).toBe('4,000 characters left');
  expect(composerCount(4000, 4000)).toBe('0 characters left');
  expect(composerCount(4002, 4000)).toBe('2 characters over the limit');
});

it('sends what a party typed and labels the default control', () => {
  const onChange = vi.fn();
  const onSend = vi.fn();
  render(<SessionComposer value="Where do I validate?" onChange={onChange} onSend={onSend} maxLength={4000} />);

  const field = screen.getByLabelText('Your message');
  expect(field.getAttribute('placeholder')).toBe('Write your message');
  expect(field.getAttribute('aria-invalid')).toBe('false');
  expect(screen.getByText('3,980 characters left')).toBeTruthy();

  fireEvent.change(field, { target: { value: 'Where do I validate it?' } });
  expect(onChange).toHaveBeenCalledWith('Where do I validate it?');

  fireEvent.click(screen.getByRole('button', { name: 'Send' }));
  expect(onSend).toHaveBeenCalledOnce();
});

it('takes its label, placeholder and action copy from the caller', () => {
  render(<SessionComposer
    value="x"
    onChange={vi.fn()}
    onSend={vi.fn()}
    maxLength={10}
    label="Your written answer"
    placeholder="Answer the question"
    sendLabel="Post answer"
  />);

  expect(screen.getByLabelText('Your written answer').getAttribute('placeholder')).toBe('Answer the question');
  expect(screen.getByRole('button', { name: 'Post answer' })).toBeTruthy();
});

it('refuses to send an empty or whitespace-only message', () => {
  const onSend = vi.fn();
  const { rerender } = render(<SessionComposer value="" onChange={vi.fn()} onSend={onSend} maxLength={4000} />);
  expect(screen.getByRole('button', { name: 'Send' }).hasAttribute('disabled')).toBe(true);

  rerender(<SessionComposer value={'   \n  '} onChange={vi.fn()} onSend={onSend} maxLength={4000} />);
  expect(screen.getByRole('button', { name: 'Send' }).hasAttribute('disabled')).toBe(true);
  expect(onSend).not.toHaveBeenCalled();
});

it('marks an over-long message and blocks the send', () => {
  render(<SessionComposer value="abcdef" onChange={vi.fn()} onSend={vi.fn()} maxLength={4} />);

  const count = screen.getByText('2 characters over the limit');
  expect(count.getAttribute('data-over')).toBe('true');
  expect(screen.getByRole('button', { name: 'Send' }).hasAttribute('disabled')).toBe(true);
});

it('locks the controls while a message is in flight', () => {
  render(<SessionComposer value="Sending this" onChange={vi.fn()} onSend={vi.fn()} maxLength={4000} pending />);

  expect(screen.getByLabelText('Your message').hasAttribute('disabled')).toBe(true);
  expect(screen.getByRole('button', { name: 'Sending…' }).hasAttribute('disabled')).toBe(true);
});

it('announces a refusal without hiding what was typed', () => {
  render(<SessionComposer
    value="Too late"
    onChange={vi.fn()}
    onSend={vi.fn()}
    maxLength={4000}
    error="This session has ended."
  />);

  expect(screen.getByRole('alert').textContent).toBe('This session has ended.');
  expect(screen.getByLabelText('Your message').getAttribute('aria-invalid')).toBe('true');
  expect(screen.getByRole('button', { name: 'Send' }).hasAttribute('disabled')).toBe(false);
});

it('sends on the modified Enter only, and never on a plain one', () => {
  const onSend = vi.fn();
  render(<SessionComposer value="One line" onChange={vi.fn()} onSend={onSend} maxLength={4000} />);
  const field = screen.getByLabelText('Your message');

  fireEvent.keyDown(field, { key: 'Enter' });
  fireEvent.keyDown(field, { key: 'a', ctrlKey: true });
  expect(onSend).not.toHaveBeenCalled();

  fireEvent.keyDown(field, { key: 'Enter', ctrlKey: true });
  expect(onSend).toHaveBeenCalledOnce();
  fireEvent.keyDown(field, { key: 'Enter', metaKey: true });
  expect(onSend).toHaveBeenCalledTimes(2);
});

it('ignores the send shortcut while the send is blocked', () => {
  const onSend = vi.fn();
  render(<SessionComposer value="  " onChange={vi.fn()} onSend={onSend} maxLength={4000} />);

  fireEvent.keyDown(screen.getByLabelText('Your message'), { key: 'Enter', ctrlKey: true });
  expect(onSend).not.toHaveBeenCalled();
});

it('states the reason and offers no controls when the session is not open', () => {
  render(<SessionComposerClosed reason="This session has not started yet." />);

  expect(screen.getByRole('note').textContent).toBe('This session has not started yet.');
  expect(screen.queryByRole('textbox')).toBeNull();
  expect(screen.queryByRole('button')).toBeNull();
});
