// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ apiCall: vi.fn() }));
vi.mock('@devmentor/ui/backend', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@devmentor/ui/backend')>()),
  apiCall: api.apiCall,
}));

const { RunPayouts, payoutRunSummaryText } = await import('./run-payouts');

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  api.apiCall.mockResolvedValue({ ok: true, data: { transferred: 2, held: 1, failed: 0 } });
});

describe('payoutRunSummaryText', () => {
  it('reads a run out in words', () => {
    expect(payoutRunSummaryText({ transferred: 2, held: 1, failed: 0 }))
      .toBe('2 transferred, 1 held, 0 failed.');
  });

  it('says plainly when there was nothing to do', () => {
    // Three zeros is not an answer anybody reads.
    expect(payoutRunSummaryText({ transferred: 0, held: 0, failed: 0 })).toBe('Nothing was due.');
  });
});

describe('RunPayouts', () => {
  it('runs the payouts and reports the outcome', async () => {
    render(<RunPayouts />);

    fireEvent.click(screen.getByRole('button', { name: 'Run payouts' }));

    await waitFor(() => expect(api.apiCall).toHaveBeenCalledWith('/api/operator/payouts/run', {
      method: 'POST',
    }));
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('2 transferred, 1 held, 0 failed.'));
  });

  it('says so when the run was refused', async () => {
    api.apiCall.mockResolvedValue({
      ok: false,
      error: { code: 'forbidden', message: 'Operators only.' },
    });
    render(<RunPayouts />);

    fireEvent.click(screen.getByRole('button', { name: 'Run payouts' }));

    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Operators only.'));
    expect(screen.queryByRole('status')).toBeNull();
  });
});
