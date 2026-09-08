// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { EmptyState } from './EmptyState';
import { LoadingMessage } from './LoadingMessage';
import { ErrorMessage } from './ErrorMessage';
afterEach(cleanup);
it('announces default and custom loading copy, with a decorative indicator', () => {
  const { rerender } = render(<LoadingMessage />);
  expect(screen.getByRole('status').textContent).toBe('Loading…');
  expect(screen.getByRole('status').firstElementChild?.getAttribute('aria-hidden')).toBe('true');
  rerender(<LoadingMessage message="Loading sessions…" className="custom" />);
  expect(screen.getByRole('status').textContent).toBe('Loading sessions…');
  expect(screen.getByRole('status').classList.contains('custom')).toBe(true);
});
it('announces errors and supports an optional recovery action', () => {
  const retry = vi.fn();
  const { rerender } = render(<ErrorMessage message="Not available" />);
  expect(screen.getByRole('alert').textContent).toBe('Not available');
  rerender(<ErrorMessage message="Try later" className="custom" action={<button onClick={retry}>Retry</button>} />);
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
  expect(retry).toHaveBeenCalledOnce();
  expect(screen.getByRole('alert').classList.contains('custom')).toBe(true);
});
it('supports minimal empty states and explanatory tone/icon/action compositions', () => {
  const { rerender } = render(<EmptyState title="No sessions" />);
  expect(screen.getByText('No sessions').parentElement?.getAttribute('data-tone')).toBe('neutral');
  expect(screen.queryByRole('button')).toBeNull();
  for (const tone of ['neutral','info','success','warning','error'] as const) {
    rerender(<EmptyState title="No sessions" description="Choose a time to begin." tone={tone} className="custom" icon={<span>Calendar</span>} action={<button>Find a time</button>} />);
    expect(screen.getByText('No sessions').parentElement?.getAttribute('data-tone')).toBe(tone);
    expect(screen.getByText('Calendar').parentElement?.getAttribute('aria-hidden')).toBe('true');
    expect(screen.getByText('Choose a time to begin.')).toBeTruthy();
    expect(screen.getByRole('button').textContent).toBe('Find a time');
  }
});
