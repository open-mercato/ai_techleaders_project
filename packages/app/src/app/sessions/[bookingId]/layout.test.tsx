import { beforeEach, describe, expect, it, vi } from 'vitest';
import { elements } from '../../../test/element-tree';
import { WorkspaceShell } from '../../../components/workspace-shell';

class RedirectSentinel extends Error {}

const session = vi.hoisted(() => ({ requirePageSession: vi.fn() }));
vi.mock('../../../lib/session', () => ({ requirePageSession: session.requirePageSession }));

const { default: SessionLayout } = await import('./layout');

const BOOKING_ID = '50000000-0000-4000-8000-000000000001';

function args() {
  return {
    children: 'the session',
    params: Promise.resolve({ bookingId: BOOKING_ID }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  session.requirePageSession.mockResolvedValue({ userId: 'u-1', roles: ['mentor'] });
});

describe('session layout', () => {
  it('requires a signed-in caller and returns them to this session afterwards', async () => {
    await SessionLayout(args());

    expect(session.requirePageSession).toHaveBeenCalledExactlyOnceWith(`/sessions/${BOOKING_ID}`);
  });

  it('wraps the session in the signed-in chrome, built from the guard-s own answer', async () => {
    const tree = await SessionLayout(args());
    const shell = elements(tree).find((element) => element.type === WorkspaceShell);

    expect((shell?.props as { session: { userId: string } }).session.userId).toBe('u-1');
    expect((shell?.props as { children: unknown }).children).toBe('the session');
  });

  it('renders nothing when the guard refuses', async () => {
    session.requirePageSession.mockRejectedValue(new RedirectSentinel('NEXT_REDIRECT'));

    await expect(SessionLayout(args())).rejects.toBeInstanceOf(RedirectSentinel);
  });
});
