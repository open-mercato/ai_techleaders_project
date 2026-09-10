// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { ApiResult } from '@devmentor/ui/backend';

/**
 * The client half of `/admin/users`, under jsdom — a Client Component, so Testing Library
 * rather than the direct invocation the surrounding server page's test uses.
 *
 * `apiCall` is the only thing mocked. It is the sanctioned fetch call site, and mocking it
 * (rather than `fetch`) is what keeps this test about the component's four states: pending,
 * rows, refusal, and the unmount that must not set state on a component that is gone.
 */

type UserRow = {
  id: string;
  email: string;
  displayName: string;
  mentorProfile: { id: string; headline: string } | null;
};

const backend = vi.hoisted(() => ({ apiCall: vi.fn() }));
vi.mock('@devmentor/ui/backend', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@devmentor/ui/backend')>()),
  apiCall: backend.apiCall,
}));

const { UsersList } = await import('./users-list');

const ADA: UserRow = {
  id: 'u-1',
  email: 'ada@devmentor.dev',
  displayName: 'Ada Lovelace',
  mentorProfile: { id: 'p-1', headline: 'Systems & algorithms mentor' },
};
const MENTEE: UserRow = {
  id: 'u-2',
  email: 'mock-mentee@devmentor.test',
  displayName: 'Mock Mentee',
  mentorProfile: null,
};

/** A promise the test resolves by hand, so the pending state can be observed. */
function deferred(): {
  promise: Promise<ApiResult<UserRow[]>>;
  settle: (result: ApiResult<UserRow[]>) => void;
} {
  let settle!: (result: ApiResult<UserRow[]>) => void;
  const promise = new Promise<ApiResult<UserRow[]>>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe('admin users list', () => {
  it('asks the guarded endpoint once and shows progress until it answers', async () => {
    const { promise } = deferred();
    backend.apiCall.mockReturnValue(promise);

    render(<UsersList />);

    expect(backend.apiCall).toHaveBeenCalledExactlyOnceWith('/api/users');
    expect(screen.getByRole('status')).toBeTruthy();
  });

  it('renders a row per user, with an em dash for a user who has no mentor profile', async () => {
    backend.apiCall.mockResolvedValue({ ok: true, data: [ADA, MENTEE] });

    render(<UsersList />);

    expect(await screen.findByRole('cell', { name: 'Ada Lovelace' })).toBeTruthy();
    expect(screen.getByRole('cell', { name: 'Systems & algorithms mentor' })).toBeTruthy();
    expect(screen.getByRole('cell', { name: 'mock-mentee@devmentor.test' })).toBeTruthy();
    expect(screen.getByRole('cell', { name: '—' })).toBeTruthy();
  });

  it('says nothing was returned rather than showing an empty table', async () => {
    backend.apiCall.mockResolvedValue({ ok: true, data: [] });

    render(<UsersList />);

    expect(await screen.findByText(/npm run db:seed/)).toBeTruthy();
  });

  it('shows the envelope error when the endpoint refuses', async () => {
    backend.apiCall.mockResolvedValue({
      ok: false,
      error: { code: 'forbidden', message: 'Operator access is required.' },
    });

    render(<UsersList />);

    expect((await screen.findByRole('alert')).textContent).toBe('Operator access is required.');
  });

  it('does not update state after it has been unmounted', async () => {
    const { promise, settle } = deferred();
    backend.apiCall.mockReturnValue(promise);
    const { unmount } = render(<UsersList />);

    unmount();
    settle({ ok: true, data: [ADA] });
    await promise;

    expect(screen.queryByRole('table')).toBeNull();
  });
});
