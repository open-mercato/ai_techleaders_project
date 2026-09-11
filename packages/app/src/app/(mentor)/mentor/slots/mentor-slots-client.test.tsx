// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ApiResource } from '@devmentor/ui/backend';
import { MentorSlotsClient, visibleMentorSlots, type MentorSlotResource } from './mentor-slots-client';

const harness = vi.hoisted(() => ({
  useApiResource: vi.fn(),
  apiCall: vi.fn(),
}));

vi.mock('@devmentor/ui/backend', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@devmentor/ui/backend')>()),
  useApiResource: harness.useApiResource,
  apiCall: harness.apiCall,
}));

const reload = vi.fn();
const past = { id: 'past', startsAt: '2026-09-10T10:00:00.000Z' };
const future = { id: 'future', startsAt: '2026-09-10T18:00:00.000Z' };

function resource(
  data: MentorSlotResource[] | undefined,
  overrides: Partial<ApiResource<MentorSlotResource[]>> = {},
): ApiResource<MentorSlotResource[]> {
  return { data, loading: false, error: undefined, reload, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-09-10T12:00:00.000Z'));
  harness.useApiResource.mockReturnValue(resource([past, future]));
  harness.apiCall.mockResolvedValue({ ok: true, data: { id: future.id } });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('filters past times unless the mentor asks to see them', () => {
  expect(visibleMentorSlots([past, future], false, Date.parse('2026-09-10T12:00:00.000Z'))).toEqual([future]);
  expect(visibleMentorSlots([past, future], true, Date.parse('2026-09-10T12:00:00.000Z'))).toEqual([past, future]);
});

it('loads the owner resource and reveals past times with the shadcn toggle', () => {
  render(<MentorSlotsClient />);
  expect(harness.useApiResource).toHaveBeenCalledWith('/api/availability/slots');
  expect(screen.getAllByRole('time')).toHaveLength(1);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Show past times' }));
  expect(screen.getAllByRole('time')).toHaveLength(2);
});

it('uses DataTable feedback for loading, errors, retry and both empty states', () => {
  harness.useApiResource.mockReturnValue(resource(undefined, { loading: true }));
  const { rerender } = render(<MentorSlotsClient />);
  expect(screen.getByRole('status').textContent).toContain('Loading');

  harness.useApiResource.mockReturnValue(resource(undefined, { error: 'Slots are unavailable.' }));
  rerender(<MentorSlotsClient />);
  expect(screen.getByRole('alert').textContent).toContain('Slots are unavailable.');
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  expect(reload).toHaveBeenCalledOnce();

  harness.useApiResource.mockReturnValue(resource([past]));
  rerender(<MentorSlotsClient />);
  expect(screen.getByText('No upcoming times')).toBeTruthy();
  fireEvent.click(screen.getByRole('checkbox', { name: 'Show past times' }));
  expect(screen.getByRole('table', { name: 'Published availability' })).toBeTruthy();

  harness.useApiResource.mockReturnValue(resource([]));
  rerender(<MentorSlotsClient />);
  expect(screen.getByText('No times published')).toBeTruthy();
});

it('publishes a browser-local datetime through CrudForm and reloads the list', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
    ok: true,
    data: { id: 'new', startsAt: '2030-01-02T12:30:00.000Z' },
  })));
  vi.stubGlobal('fetch', fetchMock);
  render(<MentorSlotsClient />);
  fireEvent.change(screen.getByLabelText(/Start time/), { target: { value: '2030-01-02T12:30' } });
  fireEvent.click(screen.getByRole('button', { name: 'Add available time' }));
  await waitFor(() => expect(reload).toHaveBeenCalledOnce());
  expect(fetchMock).toHaveBeenCalledWith('/api/availability/slots', expect.objectContaining({ method: 'POST' }));
  expect(screen.getByText(/Times use/).textContent).toContain('timezone');
});

it('removes a slot, prevents parallel removal and reloads on success', async () => {
  let finish!: (value: { ok: true; data: { id: string } }) => void;
  harness.apiCall.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
  render(<MentorSlotsClient />);
  fireEvent.click(screen.getByRole('button', { name: 'Remove time' }));
  expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Removing…' }).disabled).toBe(true);
  expect(harness.apiCall).toHaveBeenCalledWith('/api/availability/slots/future', { method: 'DELETE' });
  await act(async () => finish({ ok: true, data: { id: 'future' } }));
  expect(reload).toHaveBeenCalledOnce();
  expect(screen.getByRole('button', { name: 'Remove time' })).toBeTruthy();
});

it('shows an API refusal, clears it for a retry and reports an unexpected failure', async () => {
  harness.apiCall.mockResolvedValueOnce({
    ok: false,
    error: { code: 'not_found', message: 'This time was already removed.' },
  }).mockRejectedValueOnce(new Error('offline'));
  render(<MentorSlotsClient />);
  fireEvent.click(screen.getByRole('button', { name: 'Remove time' }));
  expect(await screen.findByText('This time was already removed.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Remove time' }));
  await waitFor(() => expect(screen.getByText('We could not remove this time. Try again.')).toBeTruthy());
  expect(screen.queryByText('This time was already removed.')).toBeNull();
});
