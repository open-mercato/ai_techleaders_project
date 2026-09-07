// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { AvailabilityPicker, DurationSelector } from './AvailabilityPicker';
afterEach(cleanup);
const days = [{ date: '2026-09-09', label: 'Wednesday, 9 September', slots: [{ id: '1', start: '2026-09-09T12:00:00Z', label: '14:00' }, { id: '2', start: '2026-09-09T13:00:00Z', label: '15:00', blockedReason: 'Already booked' }] }];

it('selects only available slots and associates blocked reasons with the correct control', () => {
  const onSlotChange = vi.fn();
  const { rerender } = render(<AvailabilityPicker days={days} timeZone="Europe/Warsaw" selectedSlotId={null} onSlotChange={onSlotChange} />);
  expect(screen.getByText(/Europe\/Warsaw/).textContent).toContain('at least 2 hours');
  fireEvent.click(screen.getByRole('button', { name: '14:00' }));
  expect(onSlotChange).toHaveBeenCalledWith('1');
  const blocked = screen.getByRole('button', { name: '15:00' }) as HTMLButtonElement;
  expect(blocked.disabled).toBe(true);
  expect(document.getElementById(blocked.getAttribute('aria-describedby')!)?.textContent).toBe('Already booked');
  fireEvent.click(blocked);
  expect(onSlotChange).toHaveBeenCalledTimes(1);
  rerender(<AvailabilityPicker days={days} timeZone="UTC" selectedSlotId="1" onSlotChange={onSlotChange} disabled />);
  expect((screen.getByRole('button', { name: '14:00' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByRole('button', { name: '14:00' }).getAttribute('aria-pressed')).toBe('true');
});

it('renders default and caller empty states for absent or empty days', () => {
  const props = { timeZone: 'UTC', selectedSlotId: null, onSlotChange: vi.fn() };
  const { rerender } = render(<AvailabilityPicker {...props} days={[]} />);
  expect(screen.getByRole('status').textContent).toContain('No sessions are available yet');
  rerender(<AvailabilityPicker {...props} days={[{ date: '2026-09-09', label: 'Wednesday', slots: [] }]} emptyMessage="Try another week." />);
  expect(screen.getByRole('status').textContent).toBe('Try another week.');
});

it('supports priced 25/50 minute options, selected state and unconfigured prices', () => {
  const onChange = vi.fn();
  const options = [{ minutes: 25 as const, price: 'EUR 45' }, { minutes: 50 as const, price: 'Price unavailable', unavailableReason: 'Mentor has not set this price.' }];
  const { rerender } = render(<DurationSelector options={options} selected={null} onChange={onChange} />);
  fireEvent.click(screen.getByRole('button', { name: '25 minutes EUR 45' }));
  expect(onChange).toHaveBeenCalledWith(25);
  const unavailable = screen.getByRole('button', { name: /50 minutes/ }) as HTMLButtonElement;
  expect(unavailable.disabled).toBe(true);
  expect(document.getElementById(unavailable.getAttribute('aria-describedby')!)?.textContent).toContain('not set');
  rerender(<DurationSelector options={[{ minutes: 50, price: 'EUR 80' }]} selected={50} onChange={onChange} disabled />);
  expect(screen.getByRole('button').getAttribute('aria-pressed')).toBe('true');
  expect((screen.getByRole('button') as HTMLButtonElement).disabled).toBe(true);
  rerender(<DurationSelector options={[{ minutes: 50, price: 'EUR 80' }]} selected={50} onChange={onChange} />);
  fireEvent.click(screen.getByRole('button'));
  expect(onChange).toHaveBeenLastCalledWith(50);
});
