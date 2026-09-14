import type { ApiHandlerOptions, Cradle, RouteLogic } from '@devmentor/core';
import { BadRequestError } from '@devmentor/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  logic: undefined as RouteLogic | undefined,
  options: undefined as ApiHandlerOptions | undefined,
  parseWebhookEvent: vi.fn(),
  handleWebhookEvent: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
}));

vi.mock('@devmentor/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@devmentor/core')>()),
  apiHandler: (logic: RouteLogic, options?: ApiHandlerOptions) => {
    state.logic = logic;
    state.options = options;
    return logic;
  },
  withRequestScope: async (_req: Request, run: (cradle: Cradle) => unknown) =>
    run({
      paymentGateway: { parseWebhookEvent: state.parseWebhookEvent },
      paymentService: { handleWebhookEvent: state.handleWebhookEvent },
      logger: { info: state.info, warn: state.warn },
    } as unknown as Cradle),
}));

const route = await import('./route');

const completed = {
  id: 'evt_1',
  type: 'checkout.session.completed',
  checkoutSessionId: 'cs_1',
  paymentIntentId: 'pi_1',
  amountTotalCents: 12_000,
  currency: 'PLN',
};

function delivery(body = '{"id":"evt_1"}', signature: string | null = 't=1,v1=abc'): Request {
  return new Request('https://devmentor.test/api/payments/webhook', {
    method: 'POST',
    body,
    ...(signature === null ? {} : { headers: { 'stripe-signature': signature } }),
  });
}

const noContext = undefined as never;

beforeEach(() => {
  vi.clearAllMocks();
  state.parseWebhookEvent.mockReturnValue(completed);
  state.handleWebhookEvent.mockResolvedValue('confirmed');
});

describe('POST /api/payments/webhook', () => {
  it('is the documented CSRF exception, and is dynamic', () => {
    // The caller is Stripe, not a browser: it cannot send the CSRF header and authenticates
    // by signing the body instead. BACKWARD_COMPATIBILITY.md §1 records this.
    expect(route.dynamic).toBe('force-dynamic');
    expect(state.options).toEqual({ csrf: false });
  });

  it('verifies the raw bytes that were sent, not a re-serialised object', async () => {
    const body = '{"id":"evt_1","spacing":  "preserved"}';

    await route.POST(delivery(body), noContext);

    expect(state.parseWebhookEvent).toHaveBeenCalledExactlyOnceWith(body, 't=1,v1=abc');
  });

  it('answers a bare status and the outcome, never the JSON envelope', async () => {
    const response = await route.POST(delivery(), noContext);

    expect(response.status).toBe(200);
    expect(await response.text()).toBe('confirmed');
    expect(response.headers.get('content-type')).not.toMatch(/application\/json/);
    expect(state.handleWebhookEvent).toHaveBeenCalledExactlyOnceWith(completed);
  });

  it('reports what it did with the delivery', async () => {
    state.handleWebhookEvent.mockResolvedValue('duplicate');

    await route.POST(delivery(), noContext);

    expect(state.info).toHaveBeenCalledWith(
      { eventId: 'evt_1', type: 'checkout.session.completed', outcome: 'duplicate' },
      'payment webhook handled',
    );
  });

  it('refuses a body that does not verify with 400, so a forgery is not redelivered', async () => {
    state.parseWebhookEvent.mockImplementation(() => {
      throw new BadRequestError('The payment notification signature did not verify.');
    });

    const response = await route.POST(delivery(), noContext);

    expect(response.status).toBe(400);
    expect(await response.text()).toBe('signature verification failed');
    expect(state.handleWebhookEvent).not.toHaveBeenCalled();
    // The code, never the message: a verification failure's text can restate what was sent.
    expect(state.warn).toHaveBeenCalledWith({ code: 'bad_request' }, 'payment webhook refused');
  });

  it('refuses a delivery with no signature header at all', async () => {
    state.parseWebhookEvent.mockImplementation(() => {
      throw new BadRequestError('The payment notification carried no signature.');
    });

    const response = await route.POST(delivery('{}', null), noContext);

    expect(response.status).toBe(400);
    expect(state.parseWebhookEvent).toHaveBeenCalledWith('{}', null);
  });

  it('labels a non-AppError verification failure without guessing its code', async () => {
    state.parseWebhookEvent.mockImplementation(() => {
      throw new Error('unexpected');
    });

    expect((await route.POST(delivery(), noContext)).status).toBe(400);
    expect(state.warn).toHaveBeenCalledWith({ code: 'unknown' }, 'payment webhook refused');
  });

  it('lets a verified delivery it cannot act on yet fail, so it is redelivered', async () => {
    const outage = new Error('connection reset');
    state.handleWebhookEvent.mockRejectedValue(outage);

    // Not caught here: it becomes a 500 through apiHandler, and a 5xx is exactly what
    // should make the provider try again.
    await expect(route.POST(delivery(), noContext)).rejects.toBe(outage);
  });
});
