// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionListItemDto } from '@devmentor/core';

/**
 * `useApiResource` is the seam, not `apiCall`: the hook imports `apiCall` through its own
 * relative path, so mocking the barrel would not intercept it — and the hook's own fetching,
 * cancellation and reload have their own tests. Mocking it here keeps this test about the
 * component's four states: loading, rows, refusal, and empty.
 */
const api = vi.hoisted(() => ({ useApiResource: vi.fn(), reload: vi.fn() }));
vi.mock('@devmentor/ui/backend', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@devmentor/ui/backend')>()),
  useApiResource: api.useApiResource,
}));

function resolves(data: SessionListItemDto[]) {
  api.useApiResource.mockReturnValue({
    data,
    loading: false,
    error: undefined,
    reload: api.reload,
  });
}

const { SessionsList, sessionCardState, sessionTitle } = await import('./sessions-list');

afterEach(cleanup);

const upcoming: SessionListItemDto = {
  id: 'b-1',
  counterpartName: 'Mock Mentor',
  lengthMinutes: 25,
  priceCents: 12_000,
  currency: 'PLN',
  status: 'confirmed',
  startsAt: '2026-09-20T09:00:00.000Z',
  isPast: false,
};
const past: SessionListItemDto = {
  ...upcoming,
  id: 'b-2',
  status: 'confirmed',
  startsAt: '2026-09-01T09:00:00.000Z',
  isPast: true,
  lengthMinutes: 50,
};

function list(overrides: Partial<Parameters<typeof SessionsList>[0]> = {}) {
  return <SessionsList
    as="mentee"
    emptyTitle="No sessions yet"
    emptyDescription="Find a mentor, choose a time."
    {...overrides}
  />;
}

beforeEach(() => {
  vi.clearAllMocks();
  resolves([upcoming, past]);
});

describe('sessionCardState', () => {
  it.each([
    ['a confirmed future session', { status: 'confirmed', isPast: false }, 'upcoming'],
    ['a confirmed session that has started', { status: 'confirmed', isPast: true }, 'ended'],
    ['a cancelled session', { status: 'cancelled', isPast: false }, 'cancelled'],
    // An unpaid hold is not a session anybody has, so not `upcoming` — and it is a future
    // time, so not `ended` either, which would contradict the section it sits in.
    ['an unpaid hold', { status: 'pending', isPast: false }, 'pending'],
    ['a hold whose time has passed', { status: 'pending', isPast: true }, 'ended'],
    ['a lapsed hold', { status: 'expired', isPast: false }, 'ended'],
  ])('draws %s as %s', (_label, overrides, expected) => {
    expect(sessionCardState({ ...upcoming, ...overrides })).toBe(expected);
  });
});

describe('sessionTitle', () => {
  it.each([
    ['expired', 'Reservation expired'],
    ['pending', 'Text session'],
    ['confirmed', 'Text session'],
    ['cancelled', 'Text session'],
  ])('names a %s booking %o', (status, expected) => {
    expect(sessionTitle({ ...upcoming, status })).toBe(expected);
  });
});

describe('SessionsList', () => {
  it('asks for the caller sessions on the side this screen is', () => {
    render(list({ as: 'mentor' }));

    // `as` chooses the query string only. Who the sessions belong to is the route's
    // decision, made from the session.
    expect(api.useApiResource).toHaveBeenCalledWith('/api/bookings?as=mentor');
  });

  it('splits upcoming from past on the server answer, not the browser clock', () => {
    render(list());

    expect(screen.getByRole('heading', { name: 'Upcoming' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Past' })).toBeTruthy();
    expect(screen.getAllByText('Mock Mentor', { exact: false })).toHaveLength(2);
    // The length lives in the card's own caption; the title does not repeat it.
    expect(screen.getByText('25-minute text session')).toBeTruthy();
    expect(screen.getByText('50-minute text session')).toBeTruthy();
    expect(screen.getAllByRole('heading', { name: 'Text session' })).toHaveLength(2);
  });

  it('omits a section it has nothing for', () => {
    resolves([upcoming]);
    render(list());

    expect(screen.getByRole('heading', { name: 'Upcoming' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Past' })).toBeNull();
  });

  it('says the session is written on every render of the screen', () => {
    render(list());

    expect(screen.getByRole('note').textContent).toMatch(/text only/);
  });

  it('explains an empty list rather than showing nothing', () => {
    resolves([]);
    render(list());

    expect(screen.getByText('No sessions yet')).toBeTruthy();
    expect(screen.getByText('Find a mentor, choose a time.')).toBeTruthy();
  });

  it('treats an answer with no rows at all as an empty list', () => {
    api.useApiResource.mockReturnValue({
      data: undefined,
      loading: false,
      error: undefined,
      reload: api.reload,
    });
    render(list());

    expect(screen.getByText('No sessions yet')).toBeTruthy();
  });

  it('says it is loading before anything arrives', () => {
    api.useApiResource.mockReturnValue({
      data: undefined,
      loading: true,
      error: undefined,
      reload: api.reload,
    });
    render(list());

    expect(screen.getByRole('status').textContent).toContain('Loading your sessions');
  });

  it('reports a failure with a way to retry', () => {
    api.useApiResource.mockReturnValue({
      data: undefined,
      loading: false,
      error: 'Something went wrong',
      reload: api.reload,
    });
    render(list());

    expect(screen.getByRole('alert').textContent).toContain('Something went wrong');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(api.reload).toHaveBeenCalledOnce();
  });

  it('renders a caller-supplied banner and per-session actions', () => {
    render(list({
      banner: <p>Your payment was sent.</p>,
      actionsFor: (session) => <button type="button">Cancel {session.id}</button>,
    }));

    expect(screen.getByText('Your payment was sent.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel b-1' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel b-2' })).toBeTruthy();
  });

  it('renders no actions when the screen offers none', () => {
    render(list());

    expect(screen.queryByRole('button')).toBeNull();
  });
});
