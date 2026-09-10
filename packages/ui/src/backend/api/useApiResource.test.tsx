// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { apiCall } from './apiCall';
import { useApiResource } from './useApiResource';

vi.mock('./apiCall', () => ({ apiCall: vi.fn() }));

const request = vi.mocked(apiCall);

function Harness({ path }: { path: string }) {
  const resource = useApiResource<{ name: string }>(path);
  return <div>
    <span>{resource.loading ? 'loading' : resource.error ?? resource.data?.name}</span>
    <button type="button" onClick={resource.reload}>Reload</button>
  </div>;
}

beforeEach(() => request.mockReset());
afterEach(cleanup);

it('loads through apiCall and reloads the current path', async () => {
  request
    .mockResolvedValueOnce({ ok: true, data: { name: 'Ada' } })
    .mockResolvedValueOnce({ ok: true, data: { name: 'Grace' } });
  render(<Harness path="/api/profile" />);

  expect(screen.getByText('loading')).toBeTruthy();
  expect(await screen.findByText('Ada')).toBeTruthy();
  const firstSignal = request.mock.calls[0]?.[1]?.signal;
  expect(firstSignal).toBeInstanceOf(AbortSignal);

  fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
  expect(screen.getByText('loading')).toBeTruthy();
  expect(await screen.findByText('Grace')).toBeTruthy();
  expect(firstSignal?.aborted).toBe(true);
  expect(request).toHaveBeenLastCalledWith('/api/profile', { signal: expect.any(AbortSignal) });
});

it('surfaces an API failure and an unexpected rejected request', async () => {
  request.mockResolvedValueOnce({ ok: false, error: { code: 'unavailable', message: 'Come back later.' } });
  render(<Harness path="/api/profile" />);
  expect(await screen.findByText('Come back later.')).toBeTruthy();

  request.mockRejectedValueOnce(new Error('unexpected'));
  fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
  expect(await screen.findByText('We could not load this information. Try again.')).toBeTruthy();
});

it('aborts on path change and ignores completion from the superseded path', async () => {
  let finishOld!: (value: Awaited<ReturnType<typeof apiCall<{ name: string }>>>) => void;
  request
    .mockReturnValueOnce(new Promise((resolve) => { finishOld = resolve; }))
    .mockResolvedValueOnce({ ok: true, data: { name: 'New profile' } });
  const { rerender } = render(<Harness path="/api/old" />);
  const oldSignal = request.mock.calls[0]?.[1]?.signal;

  rerender(<Harness path="/api/new" />);
  expect(screen.getByText('loading')).toBeTruthy();
  expect(oldSignal?.aborted).toBe(true);
  finishOld({ ok: true, data: { name: 'Old profile' } });
  expect(await screen.findByText('New profile')).toBeTruthy();
  expect(screen.queryByText('Old profile')).toBeNull();
});

it('aborts on unmount and ignores both resolved and rejected completions', async () => {
  let finish!: (value: Awaited<ReturnType<typeof apiCall<{ name: string }>>>) => void;
  let reject!: (reason: unknown) => void;
  request
    .mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }))
    .mockReturnValueOnce(new Promise((_resolve, rejectPromise) => { reject = rejectPromise; }));

  const first = render(<Harness path="/api/profile" />);
  const resolvedSignal = request.mock.calls[0]?.[1]?.signal;
  first.unmount();
  finish({ ok: true, data: { name: 'Too late' } });
  expect(resolvedSignal?.aborted).toBe(true);

  const second = render(<Harness path="/api/other" />);
  const rejectedSignal = request.mock.calls[1]?.[1]?.signal;
  second.unmount();
  reject(new Error('Too late'));
  expect(rejectedSignal?.aborted).toBe(true);
  await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
});
