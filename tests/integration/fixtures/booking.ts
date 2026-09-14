import { createHmac } from 'node:crypto';
import { Booking, MikroORM, Notification, Payout, Slot, entities } from '@devmentor/db';
import { signInCookieHeader } from '../agent-browser';

/**
 * Booking-side helpers shared by the E03 scenarios.
 *
 * They exist because every money scenario needs the same three steps before the interesting
 * part — reserve, open a checkout, deliver a signed webhook — and a copy of them in five
 * files is five places for the flow to drift from the product.
 */

/**
 * The secret `MockPaymentGateway` signs with.
 *
 * Copied rather than imported: `core` exports the port and deliberately not the adapters, so
 * nothing outside `container.ts` can choose one. It is not a credential — it protects a
 * gateway that moves no money — and the app under test uses the mock because the harness
 * sets no `STRIPE_SECRET_KEY`.
 */
export const MOCK_WEBHOOK_SECRET = 'mock-webhook-secret';

export const CSRF_HEADERS = {
  'content-type': 'application/json',
  'x-devmentor-request': '1',
};

export async function withOrm<T>(
  databaseUrl: string,
  run: (orm: MikroORM) => Promise<T>,
): Promise<T> {
  const orm = await MikroORM.init({ clientUrl: databaseUrl, entities });
  await orm.connect();
  try {
    return await run(orm);
  } finally {
    await orm.close(true);
  }
}

/** Sign a body the way the mock gateway does, so the webhook route accepts it. */
export function signDelivery(event: Record<string, unknown>): {
  rawBody: string;
  signature: string;
} {
  const rawBody = JSON.stringify(event);
  return {
    rawBody,
    signature: createHmac('sha256', MOCK_WEBHOOK_SECRET).update(rawBody).digest('hex'),
  };
}

/** Post a delivery to the webhook route and return what it answered. */
export async function deliverWebhook(
  baseUrl: string,
  event: Record<string, unknown>,
  signature?: string,
): Promise<{ status: number; outcome: string }> {
  const delivery = signDelivery(event);
  const response = await fetch(`${baseUrl}/api/payments/webhook`, {
    method: 'POST',
    headers: { 'stripe-signature': signature ?? delivery.signature },
    body: delivery.rawBody,
  });
  return { status: response.status, outcome: await response.text() };
}

export interface ReservedBooking {
  id: string;
  cookie: string;
  checkoutSessionId: string;
  priceCents: number;
}

/** Reserve a slot as a mentee and open its checkout, without paying. */
export async function reserveAndOpenCheckout(
  baseUrl: string,
  databaseUrl: string,
  slotId: string,
  { login = 'mock-mentee', lengthMinutes = 25 }: { login?: string; lengthMinutes?: 25 | 50 } = {},
): Promise<ReservedBooking> {
  const cookie = await signInCookieHeader(baseUrl, login);
  const reserved = await fetch(`${baseUrl}/api/bookings`, {
    method: 'POST',
    headers: { ...CSRF_HEADERS, cookie },
    body: JSON.stringify({ slotId, lengthMinutes }),
  });
  if (!reserved.ok) throw new Error(`reserving answered ${reserved.status}`);
  const { data } = (await reserved.json()) as { data: { id: string } };

  const checkout = await fetch(`${baseUrl}/api/bookings/${data.id}/checkout`, {
    method: 'POST',
    headers: { ...CSRF_HEADERS, cookie },
  });
  if (!checkout.ok) throw new Error(`opening the checkout answered ${checkout.status}`);

  const stored = await withOrm(databaseUrl, async (orm) =>
    orm.em.fork().findOneOrFail(Booking, { id: data.id }));
  return {
    id: data.id,
    cookie,
    checkoutSessionId: stored.stripeCheckoutSessionId!,
    priceCents: stored.priceCents,
  };
}

/** Reserve, open a checkout, and confirm it with a verified delivery. */
export async function bookAndPay(
  baseUrl: string,
  databaseUrl: string,
  slotId: string,
  options: { login?: string; lengthMinutes?: 25 | 50; eventId?: string } = {},
): Promise<ReservedBooking> {
  const reserved = await reserveAndOpenCheckout(baseUrl, databaseUrl, slotId, options);
  const { outcome } = await deliverWebhook(baseUrl, {
    id: options.eventId ?? `evt_${reserved.id}`,
    type: 'checkout.session.completed',
    checkoutSessionId: reserved.checkoutSessionId,
    paymentIntentId: `pi_${reserved.id}`,
    amountTotalCents: reserved.priceCents,
    currency: 'PLN',
  });
  if (outcome !== 'confirmed') throw new Error(`the webhook answered ${outcome}`);
  return reserved;
}

/** Read one booking back, for an assertion about what the product actually stored. */
export async function readBooking(databaseUrl: string, bookingId: string) {
  return withOrm(databaseUrl, async (orm) =>
    orm.em.fork().findOneOrFail(Booking, { id: bookingId }));
}

/**
 * Move a session into the past.
 *
 * The booking route refuses a start inside two hours, so a *finished* session cannot be
 * created through the API at all. Reserving a real one and moving its start is the honest
 * way to reach the state the payout run is about.
 */
export async function moveSessionToThePast(
  databaseUrl: string,
  bookingId: string,
  hoursAgo = 2,
): Promise<void> {
  await withOrm(databaseUrl, async (orm) => {
    const em = orm.em.fork();
    const booking = await em.findOneOrFail(Booking, { id: bookingId });
    booking.startsAt = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
    await em.flush();
  });
}

/**
 * Remove everything a booking scenario created, in dependency order.
 *
 * Payouts and notifications reference bookings, and bookings reference slots with
 * `on delete restrict` — a money record must not vanish with the time it was made for — so
 * the order here is not cosmetic.
 */
export async function clearBookingData(databaseUrl: string): Promise<void> {
  await withOrm(databaseUrl, async (orm) => {
    const em = orm.em.fork();
    await em.nativeDelete(Payout, {});
    await em.nativeDelete(Notification, {});
    await em.nativeDelete(Booking, {});
    await em.nativeDelete(Slot, {});
  });
}
