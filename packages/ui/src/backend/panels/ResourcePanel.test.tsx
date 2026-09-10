// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { ApiResource } from '../api/useApiResource';
import { ResourcePanel } from './ResourcePanel';

afterEach(cleanup);

function resource<T>(overrides: Partial<ApiResource<T>> = {}): ApiResource<T> {
  return {
    data: undefined,
    loading: false,
    error: undefined,
    reload: vi.fn(),
    ...overrides,
  };
}

it('renders loading before all other states and does not call children', () => {
  const children = vi.fn(() => <p>Loaded</p>);
  render(<ResourcePanel resource={resource({ loading: true, error: 'Ignored', data: { name: 'Ignored' } })}
    loadingMessage="Loading your profile…">{children}</ResourcePanel>);
  expect(screen.getByRole('status').textContent).toContain('Loading your profile…');
  expect(children).not.toHaveBeenCalled();
});

it('renders an error with a working retry action before loaded data', () => {
  const retry = vi.fn();
  const children = vi.fn(() => <p>Loaded</p>);
  render(<ResourcePanel resource={resource({ error: 'Profile unavailable.', data: { name: 'Ignored' }, reload: retry })}>
    {children}
  </ResourcePanel>);
  expect(screen.getByRole('alert').textContent).toContain('Profile unavailable.');
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(retry).toHaveBeenCalledOnce();
  expect(children).not.toHaveBeenCalled();
});

it('renders default and configured empty states without calling children', () => {
  const children = vi.fn(() => <p>Loaded</p>);
  const { rerender } = render(<ResourcePanel resource={resource()}>{children}</ResourcePanel>);
  expect(screen.getByText('Nothing to show yet')).toBeTruthy();

  rerender(<ResourcePanel resource={resource({ data: [] as string[] })} isEmpty={(rows) => rows.length === 0}
    emptyTitle="No rows" emptyDescription="Create the first one." emptyAction={<a href="/new">Create</a>}>
    {children}
  </ResourcePanel>);
  expect(screen.getByText('No rows')).toBeTruthy();
  expect(screen.getByText('Create the first one.')).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Create' })).toBeTruthy();
  expect(children).not.toHaveBeenCalled();
});

it('calls children only with loaded, non-empty data', () => {
  const children = vi.fn((data: { name: string }) => <p>{data.name}</p>);
  render(<ResourcePanel resource={resource({ data: { name: 'Ada' } })}>{children}</ResourcePanel>);
  expect(screen.getByText('Ada')).toBeTruthy();
  expect(children).toHaveBeenCalledExactlyOnceWith({ name: 'Ada' });
});
