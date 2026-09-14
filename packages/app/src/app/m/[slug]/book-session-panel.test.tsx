// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const router = vi.hoisted(() => ({ push: vi.fn() }));
const api = vi.hoisted(() => ({ apiCall: vi.fn() }));

vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@devmentor/ui/backend', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@devmentor/ui/backend')>()),
  apiCall: api.apiCall,
}));

const { BookSessionPanel, bookingReturnTo } = await import('./book-session-panel');

afterEach(cleanup);
beforeEach(() => {
  vi.clearAllMocks();
  api.apiCall.mockResolvedValue({ ok: true, data: { id: 'booking-1', expiresAt: null } });
});

const slots = [
  { id: 'ok', startsAt: '2026-09-20T09:00:00.000Z', meetsLeadTime: true },
  { id: 'soon', startsAt: '2026-09-20T10:00:00.000Z', meetsLeadTime: false },
];
const prices = { price25Cents: 12_000, price50Cents: 22_000, currency: 'PLN' };

function panel(overrides: Partial<Parameters<typeof BookSessionPanel>[0]> = {}) {
  return <BookSessionPanel
    mentorSlug="ada"
    mentorName="Ada Lovelace"
    slots={slots}
    prices={prices}
    signedInAsMentee
    {...overrides}
  />;
}

describe('bookingReturnTo', () => {
  it('names the mentor page, carrying the chosen time when there is one', () => {
    expect(bookingReturnTo('ada', null)).toBe('/m/ada');
    expect(bookingReturnTo('ada', 'slot 1')).toBe('/m/ada?slot=slot%201');
  });
});

describe('BookSessionPanel', () => {
  it('offers both lengths at the mentor own prices', () => {
    render(panel());

    expect(screen.getByRole('button', { name: /25 minutes/ }).textContent).toContain('PLN 120.00');
    expect(screen.getByRole('button', { name: /50 minutes/ }).textContent).toContain('PLN 220.00');
  });

  it('disables a time inside the two-hour rule and says why', () => {
    render(panel());

    const blocked = screen.getByRole('button', { name: '10:00' });
    expect(blocked.hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Starts in less than two hours.')).toBeTruthy();
  });

  it('shows the price for the chosen length before anything is charged', () => {
    render(panel());

    fireEvent.click(screen.getByRole('button', { name: '09:00' }));
    fireEvent.click(screen.getByRole('button', { name: /50 minutes/ }));

    const summary = screen.getByRole('region', { name: /Your session with Ada Lovelace/ });
    expect(summary.textContent).toContain('PLN 220.00');
    expect(summary.textContent).toContain('50-minute text session');
  });

  it('says on every render that the session is written and promises no timing', () => {
    render(panel());

    expect(screen.getByRole('note').textContent).toMatch(/text only/);
    expect(screen.getByRole('note').textContent).toMatch(/no promise/);
  });

  it('reserves the chosen time and length for a signed-in mentee', async () => {
    render(panel());

    fireEvent.click(screen.getByRole('button', { name: '09:00' }));
    fireEvent.click(screen.getByRole('button', { name: /25 minutes/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue to payment' }));

    await waitFor(() => expect(api.apiCall).toHaveBeenCalledWith('/api/bookings', {
      body: { slotId: 'ok', lengthMinutes: 25 },
    }));
    await waitFor(() =>
      expect(screen.getByText('This time is held for you while you pay.')).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Continue to payment' })).toBeNull();
  });

  it('sends a signed-out visitor to sign in and back to the same time', () => {
    render(panel({ signedInAsMentee: false }));

    fireEvent.click(screen.getByRole('button', { name: '09:00' }));
    fireEvent.click(screen.getByRole('button', { name: /25 minutes/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Sign in to book' }));

    expect(router.push).toHaveBeenCalledExactlyOnceWith('/sign-in?returnTo=%2Fm%2Fada%3Fslot%3Dok');
    expect(api.apiCall).not.toHaveBeenCalled();
  });

  it('preselects the time carried back from sign-in', () => {
    render(panel({ initialSlotId: 'ok' }));

    expect(screen.getByRole('button', { name: '09:00' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('ignores a carried-back time the server will not accept', () => {
    render(panel({ initialSlotId: 'soon' }));

    expect(screen.getByRole('button', { name: '09:00' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('reports a refusal from the server without losing the choice', async () => {
    api.apiCall.mockResolvedValue({
      ok: false,
      error: { code: 'conflict', message: 'This time has just been taken. Choose another one.' },
    });
    render(panel());

    fireEvent.click(screen.getByRole('button', { name: '09:00' }));
    fireEvent.click(screen.getByRole('button', { name: /25 minutes/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue to payment' }));

    await waitFor(() =>
      expect(screen.getByText('This time has just been taken. Choose another one.')).toBeTruthy());
    expect(screen.getByRole('button', { name: '09:00' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('says a mentor without prices is not bookable instead of offering a choice', () => {
    render(panel({ prices: null }));

    expect(screen.getByRole('status').textContent).toBe(
      'Ada Lovelace is not taking bookings at the moment.',
    );
    expect(screen.queryByRole('button', { name: '09:00' })).toBeNull();
  });

  it('explains an empty calendar rather than showing nothing', () => {
    render(panel({ slots: [] }));

    expect(screen.getByRole('status').textContent).toMatch(/No sessions are available yet/);
  });

  it('does nothing when the action fires before both choices are made', async () => {
    render(panel({ initialSlotId: 'ok' }));

    // No length chosen, so no summary and therefore no action to press.
    expect(screen.queryByRole('button', { name: 'Continue to payment' })).toBeNull();
    expect(api.apiCall).not.toHaveBeenCalled();
  });
});
