// @vitest-environment jsdom

/**
 * `WorkflowAction` is a client component, so it is rendered under jsdom with Testing Library
 * and driven with real pointer input (AGENTS.md, "Testing React components and pages").
 *
 * `apiCall` is the seam. It is already the only sanctioned fetch site and it never rejects —
 * a network failure comes back as a failure envelope — so mocking it here covers every
 * outcome the component can actually see, and the one it cannot: an `onSuccess` that throws.
 */

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ApiResult } from '../api/types';
import { apiCall } from '../api/apiCall';
import { WorkflowAction } from './WorkflowAction';

vi.mock('../api/apiCall', () => ({ apiCall: vi.fn() }));

const request = vi.mocked(apiCall);

beforeEach(() => {
  request.mockReset();
  request.mockResolvedValue({ ok: true, data: null });
});

afterEach(cleanup);

/** The action's only control. No `jest-dom` in this repo, so `disabled` is read directly. */
function button(name?: string): HTMLButtonElement {
  return screen.getByRole('button', name === undefined ? {} : { name }) as HTMLButtonElement;
}

/** A request the test releases by hand, so the pending state can be observed. */
function deferredRequest() {
  let release!: (result: ApiResult<unknown>) => void;
  request.mockReturnValue(new Promise<ApiResult<unknown>>((resolve) => (release = resolve)));
  return release;
}

it('posts the body to the endpoint and hands the envelope data to onSuccess', async () => {
  const onSuccess = vi.fn();
  render(
    <WorkflowAction
      endpoint="/api/bookings/b-1/cancel"
      body={{ reason: 'illness' }}
      label="Cancel booking"
      onSuccess={onSuccess}
    />,
  );
  request.mockResolvedValue({ ok: true, data: { status: 'cancelled' } });

  await userEvent.click(button('Cancel booking'));

  // POST by default, through `apiCall` — which is what puts the CSRF header on it. A route
  // reached with a raw `fetch` would be refused before its body ran (edge case 23).
  expect(request).toHaveBeenCalledExactlyOnceWith('/api/bookings/b-1/cancel', {
    method: 'POST',
    body: { reason: 'illness' },
  });
  expect(onSuccess).toHaveBeenCalledExactlyOnceWith({ status: 'cancelled' });
});

it('sends the method it is given, with no body when there is nothing to send', async () => {
  render(<WorkflowAction endpoint="/api/payouts/batch" method="DELETE" label="Close batch" />);

  await userEvent.click(button('Close batch'));

  expect(request).toHaveBeenCalledExactlyOnceWith('/api/payouts/batch', {
    method: 'DELETE',
    body: undefined,
  });
});

it('completes without an onSuccess handler', async () => {
  render(<WorkflowAction endpoint="/api/payouts/run" label="Run payouts" />);

  await userEvent.click(button('Run payouts'));

  await waitFor(() => expect(button().disabled).toBe(false));
  expect(screen.queryByRole('alert')).toBeNull();
});

it('disables and relabels the button while the request is in flight', async () => {
  const release = deferredRequest();
  render(<WorkflowAction endpoint="/api/payouts/run" label="Run payouts" />);

  await userEvent.click(button('Run payouts'));

  // The default pending label is the action's own words, so the button does not change
  // meaning mid-press.
  const pendingButton = button('Run payouts…');
  expect(pendingButton.disabled).toBe(true);
  expect(pendingButton.getAttribute('aria-busy')).toBe('true');

  // A second press while disabled must not produce a second payout run.
  await userEvent.click(pendingButton);
  expect(request).toHaveBeenCalledOnce();

  release({ ok: true, data: null });
  await waitFor(() => expect(button('Run payouts').disabled).toBe(false));
  expect(button().getAttribute('aria-busy')).toBe('false');
});

it('uses an explicit pending label when the action reads better in progress', async () => {
  deferredRequest();
  render(
    <WorkflowAction
      endpoint="/api/notes/n-1/approve"
      label="Approve"
      pendingLabel="Approving…"
      variant="secondary"
    />,
  );

  await userEvent.click(button('Approve'));

  expect(button('Approving…').disabled).toBe(true);
});

it("surfaces the server's own message, and clears it on the next attempt", async () => {
  request.mockResolvedValueOnce({
    ok: false,
    error: { code: 'rate_limited', message: 'Too many requests. Try again in 30 seconds.' },
  });
  render(<WorkflowAction endpoint="/api/payouts/run" label="Run payouts" />);

  await userEvent.click(button('Run payouts'));

  // The envelope's message, not a generic apology: it carries the wait-and-retry advice.
  expect((await screen.findByRole('alert')).textContent).toBe(
    'Too many requests. Try again in 30 seconds.',
  );
  // Failing leaves the action usable — this is a retry, not a dead end.
  expect(button('Run payouts').disabled).toBe(false);

  await userEvent.click(button('Run payouts'));

  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
});

it('reports a handler that throws instead of leaving the press silent', async () => {
  render(
    <WorkflowAction
      endpoint="/api/payouts/run"
      label="Run payouts"
      onSuccess={() => {
        throw new Error('navigation blew up');
      }}
    />,
  );

  await userEvent.click(button('Run payouts'));

  expect((await screen.findByRole('alert')).textContent).toBe(
    'We could not complete the request. Try again.',
  );
  expect(button('Run payouts').disabled).toBe(false);
});
