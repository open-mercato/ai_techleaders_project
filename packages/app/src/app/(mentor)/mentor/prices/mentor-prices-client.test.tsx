// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiResource } from '@devmentor/ui/backend';
import { MentorPricesClient, type MentorPricesResource } from './mentor-prices-client';

const harness = vi.hoisted(() => ({ useApiResource: vi.fn() }));
vi.mock('@devmentor/ui/backend', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@devmentor/ui/backend')>()),
  useApiResource: harness.useApiResource,
}));

const reload = vi.fn();
const policy = {
  priceCurrency: 'PLN',
  priceBounds: {
    p25: { minCents: 9_001, maxCents: 60_000 },
    p50: { minCents: 18_000, maxCents: 120_099 },
  },
} satisfies MentorPricesResource;

function resource(
  data: MentorPricesResource | undefined,
  overrides: Partial<ApiResource<MentorPricesResource>> = {},
): ApiResource<MentorPricesResource> {
  return { data, loading: false, error: undefined, reload, ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  harness.useApiResource.mockReturnValue(resource(policy));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('MentorPricesClient', () => {
  it('renders loading, errors and their retry action through ResourcePanel', () => {
    harness.useApiResource.mockReturnValue(resource(undefined, { loading: true }));
    const { rerender } = render(<MentorPricesClient />);
    expect(screen.getByRole('status').textContent).toContain('Loading your session prices…');

    harness.useApiResource.mockReturnValue(resource(undefined, { error: 'Could not load prices.' }));
    rerender(<MentorPricesClient />);
    expect(screen.getByRole('alert').textContent).toContain('Could not load prices.');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reload).toHaveBeenCalledOnce();
  });

  it('renders blank exact-decimal fields and server-owned wrapping bounds for an unpriced mentor', () => {
    render(<MentorPricesClient />);
    expect(screen.getByLabelText<HTMLInputElement>(/25-minute price/).value).toBe('');
    expect(screen.getByLabelText<HTMLInputElement>(/50-minute price/).value).toBe('');
    expect(within(screen.getByRole('group', { name: 'Allowed session prices' })).getAllByText(/minutes:/)
      .map((node) => node.textContent)).toEqual([
      '25 minutes: PLN 90.01 to PLN 600.00',
      '50 minutes: PLN 180.00 to PLN 1200.99',
    ]);
    expect(screen.getAllByText('PLN', { selector: '[aria-hidden="true"]' })).toHaveLength(2);
  });

  it('renders persisted cents as exact decimal strings', () => {
    harness.useApiResource.mockReturnValue(resource({
      ...policy,
      prices: { price25Cents: 9_001, price50Cents: 18_090, currency: 'PLN' },
    }));
    render(<MentorPricesClient />);
    expect(screen.getByLabelText<HTMLInputElement>(/25-minute price/).value).toBe('90.01');
    expect(screen.getByLabelText<HTMLInputElement>(/50-minute price/).value).toBe('180.90');
  });

  it('submits both decimal strings together, announces success and reloads', async () => {
    let finish!: (response: Response) => void;
    const fetch = vi.fn(() => new Promise<Response>((resolve) => { finish = resolve; }));
    vi.stubGlobal('fetch', fetch);
    render(<MentorPricesClient />);
    fireEvent.change(screen.getByLabelText(/25-minute price/), { target: { value: '90.01' } });
    fireEvent.change(screen.getByLabelText(/50-minute price/), { target: { value: '180.00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save prices' }));

    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Saving…' }).disabled).toBe(true);
    expect(fetch).toHaveBeenCalledWith('/api/mentors/me/prices', expect.objectContaining({
      method: 'PUT',
      body: JSON.stringify({ price25: '90.01', price50: '180.00' }),
    }));
    await act(async () => finish(new Response(JSON.stringify({ ok: true, data: {} }))));
    await waitFor(() => expect(reload).toHaveBeenCalledOnce());
    expect(screen.getByRole('status').textContent).toContain('Session prices saved.');
  });

  it('retains entered values and associates a refused server bound with its field', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      ok: false,
      error: {
        code: 'validation_failed',
        message: 'Choose prices within the platform bounds.',
        fieldErrors: { price25: ['Enter an amount from PLN 90.01 to PLN 600.00.'] },
      },
    }))));
    render(<MentorPricesClient />);
    fireEvent.change(screen.getByLabelText(/25-minute price/), { target: { value: '90.00' } });
    fireEvent.change(screen.getByLabelText(/50-minute price/), { target: { value: '180.00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save prices' }));
    expect(await screen.findByText('Enter an amount from PLN 90.01 to PLN 600.00.')).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>(/25-minute price/).value).toBe('90.00');
    expect(document.activeElement).toBe(screen.getByLabelText(/25-minute price/));
    expect(reload).not.toHaveBeenCalled();
  });

  it.each([
    { priceBounds: undefined, priceCurrency: 'PLN' },
    { priceBounds: policy.priceBounds, priceCurrency: undefined },
  ])('fails closed when a live price setting is missing', (missing) => {
    harness.useApiResource.mockReturnValue(resource(missing));
    render(<MentorPricesClient />);
    expect(screen.getByRole('alert').textContent).toContain('Price settings are unavailable.');
    expect(screen.queryByRole('button', { name: 'Save prices' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(reload).toHaveBeenCalledOnce();
  });
});
