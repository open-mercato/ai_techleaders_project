// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PayoutDto } from '@devmentor/core';

const api = vi.hoisted(() => ({ useApiResource: vi.fn(), reload: vi.fn() }));
vi.mock('@devmentor/ui/backend', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@devmentor/ui/backend')>()),
  useApiResource: api.useApiResource,
}));

const { PayoutsList, heldExplanation, payoutCardState } = await import('./payouts-list');

afterEach(cleanup);

const payout: PayoutDto = {
  id: 'payout-1',
  bookingId: 'b-1',
  amountCents: 9_600,
  status: 'transferred',
  heldReason: null,
  sessionStartsAt: '2026-09-20T09:00:00.000Z',
  priceCents: 12_000,
  platformFeeCents: 2_400,
  currency: 'PLN',
};

function resolves(data: PayoutDto[]) {
  api.useApiResource.mockReturnValue({
    data, loading: false, error: undefined, reload: api.reload,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  resolves([payout]);
});

describe('payoutCardState', () => {
  it.each([
    ['transferred', 'transferred'],
    ['failed', 'failed'],
    ['held', 'held'],
  ])('draws a %s payout as %s', (status, expected) => {
    expect(payoutCardState({ ...payout, status })).toBe(expected);
  });
});

describe('heldExplanation', () => {
  it('says where a sent payout went', () => {
    expect(heldExplanation(payout)).toBe('Sent to your payout account.');
  });

  it('says a failed transfer will be retried rather than leaving it hanging', () => {
    expect(heldExplanation({ ...payout, status: 'failed' })).toContain('try again');
  });

  it('names the onboarding hold in the mentor own terms, not the enum', () => {
    expect(heldExplanation({
      ...payout,
      status: 'held',
      heldReason: 'connect_onboarding_incomplete',
    })).toContain('payout account to be set up');
  });

  it('falls back to plain waiting when a hold has no reason on it', () => {
    expect(heldExplanation({ ...payout, status: 'held', heldReason: null }))
      .toBe('Waiting to be sent.');
  });
});

describe('PayoutsList', () => {
  it('shows the price, the fee and the share, so the split is checkable', () => {
    render(<PayoutsList />);

    expect(screen.getByText('PLN 120.00')).toBeTruthy();
    expect(screen.getByText('PLN 24.00')).toBeTruthy();
    expect(screen.getByText('PLN 96.00')).toBeTruthy();
    expect(api.useApiResource).toHaveBeenCalledWith('/api/mentor/payouts');
  });

  it('lists a held payout rather than hiding it', () => {
    resolves([{ ...payout, status: 'held', heldReason: 'connect_onboarding_incomplete' }]);
    render(<PayoutsList />);

    // Money owed and not yet sent is exactly what a mentor wants to see.
    expect(screen.getByText(/payout account to be set up/)).toBeTruthy();
    expect(screen.getByText('Held')).toBeTruthy();
  });

  it('explains an empty list rather than showing nothing', () => {
    resolves([]);
    render(<PayoutsList />);

    expect(screen.getByText('No payouts yet')).toBeTruthy();
  });

  it('treats an answer with no rows as an empty list', () => {
    api.useApiResource.mockReturnValue({
      data: undefined, loading: false, error: undefined, reload: api.reload,
    });
    render(<PayoutsList />);

    expect(screen.getByText('No payouts yet')).toBeTruthy();
  });

  it('says it is loading, and offers a retry when the read failed', () => {
    api.useApiResource.mockReturnValue({
      data: undefined, loading: true, error: undefined, reload: api.reload,
    });
    expect(render(<PayoutsList />).container.textContent).toContain('Loading your payouts');

    cleanup();
    api.useApiResource.mockReturnValue({
      data: undefined, loading: false, error: 'offline', reload: api.reload,
    });
    render(<PayoutsList />);
    expect(screen.getByRole('alert').textContent).toContain('offline');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(api.reload).toHaveBeenCalledOnce();
  });
});
