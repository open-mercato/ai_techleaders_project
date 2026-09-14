import { beforeEach, describe, expect, it, vi } from 'vitest';
import { elements, text } from '../../../test/element-tree';
import { SessionsList } from '../../../components/sessions-list';
import { BookedBanner } from './booked-banner';

/**
 * `/home` invoked directly. The assertion that matters first is still the guard one: the
 * page calls it **itself**, with its own path, rather than trusting the layout that wrapped
 * it.
 */

class RedirectSentinel extends Error {}

const session = vi.hoisted(() => ({ requirePageRole: vi.fn() }));
vi.mock('../../../lib/session', () => ({ requirePageRole: session.requirePageRole }));

const { default: MenteeHomePage } = await import('./page');

function listProps(tree: Awaited<ReturnType<typeof MenteeHomePage>>) {
  const found = elements(tree).find((element) => element.type === SessionsList);
  return found?.props as Parameters<typeof SessionsList>[0] | undefined;
}

beforeEach(() => {
  vi.clearAllMocks();
  session.requirePageRole.mockResolvedValue({ userId: 'u-1', roles: ['mentee'] });
});

describe('mentee home page', () => {
  it('enforces the mentee role at the page, not only at the layout', async () => {
    await MenteeHomePage({});

    expect(session.requirePageRole).toHaveBeenCalledWith('mentee', '/home');
  });

  it('shows the mentee their own sessions under the heading #12 named', async () => {
    const tree = await MenteeHomePage({});

    expect(text(tree)).toContain('My sessions');
    expect(listProps(tree)?.as).toBe('mentee');
    expect(listProps(tree)?.emptyTitle).toBe('No sessions yet');
    expect(listProps(tree)?.emptyDescription).toContain('Find a mentor');
  });

  it('shows no payment banner when the mentee simply opened the page', async () => {
    expect(listProps(await MenteeHomePage({}))?.banner).toBeUndefined();
    expect(
      listProps(await MenteeHomePage({ searchParams: Promise.resolve({}) }))?.banner,
    ).toBeUndefined();
  });

  it('acknowledges a return from checkout without claiming the booking is confirmed', async () => {
    const tree = await MenteeHomePage({
      searchParams: Promise.resolve({ booked: 'booking-1' }),
    });

    const banner = listProps(tree)?.banner;
    expect(banner).toBeDefined();
    // The banner is a hint from a query string. Only a verified webhook confirms a booking,
    // so the page must not promise one.
    expect(elements(banner).find((element) => element.type === BookedBanner)).toBeDefined();
  });

  it('renders nothing when the guard refuses', async () => {
    session.requirePageRole.mockRejectedValue(new RedirectSentinel('NEXT_REDIRECT'));

    await expect(MenteeHomePage({})).rejects.toBeInstanceOf(RedirectSentinel);
  });
});
