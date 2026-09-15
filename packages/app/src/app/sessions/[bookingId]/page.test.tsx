import { beforeEach, describe, expect, it, vi } from 'vitest';
import { elements } from '../../../test/element-tree';
import { SessionScreen } from './session-screen';

class RedirectSentinel extends Error {}

const session = vi.hoisted(() => ({ requirePageSession: vi.fn() }));
vi.mock('../../../lib/session', () => ({ requirePageSession: session.requirePageSession }));

const { default: SessionPage } = await import('./page');

const BOOKING_ID = '50000000-0000-4000-8000-000000000001';

function params(): Promise<{ bookingId: string }> {
  return Promise.resolve({ bookingId: BOOKING_ID });
}

beforeEach(() => {
  vi.clearAllMocks();
  session.requirePageSession.mockResolvedValue({ userId: 'u-1', roles: ['mentee'] });
});

describe('session page', () => {
  it('guards at the page as well as at the layout, and returns here afterwards', async () => {
    await SessionPage({ params: params() });

    expect(session.requirePageSession).toHaveBeenCalledWith(`/sessions/${BOOKING_ID}`);
  });

  it('asks for no role, because a party is not a role', async () => {
    await SessionPage({ params: params() });

    expect(session.requirePageSession).toHaveBeenCalledExactlyOnceWith(`/sessions/${BOOKING_ID}`);
    expect(session.requirePageSession.mock.calls[0]).toHaveLength(1);
  });

  it('hands the screen the id from the address and the caller-s own way back', async () => {
    const tree = await SessionPage({ params: params() });
    const screen = elements(tree).find((element) => element.type === SessionScreen);

    expect((screen?.props as { bookingId: string }).bookingId).toBe(BOOKING_ID);
    expect((screen?.props as { backHref: string }).backHref).toBe('/home');
  });

  it('sends a mentor back to the booked-sessions list instead', async () => {
    session.requirePageSession.mockResolvedValue({ userId: 'u-2', roles: ['mentor'] });

    const tree = await SessionPage({ params: params() });
    const screen = elements(tree).find((element) => element.type === SessionScreen);

    expect((screen?.props as { backHref: string }).backHref).toBe('/mentor/sessions');
  });

  it('renders nothing when the guard refuses', async () => {
    session.requirePageSession.mockRejectedValue(new RedirectSentinel('NEXT_REDIRECT'));

    await expect(SessionPage({ params: params() })).rejects.toBeInstanceOf(RedirectSentinel);
  });
});
