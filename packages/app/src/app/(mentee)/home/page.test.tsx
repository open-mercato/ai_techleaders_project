import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmptyState } from '@devmentor/ui/backend';
import { elements, text } from '../../../test/element-tree';

/**
 * `/home` invoked directly. The assertion that matters is the first one: the page calls the
 * guard **itself**, with its own path, rather than trusting the layout that wrapped it.
 */

class RedirectSentinel extends Error {}

const session = vi.hoisted(() => ({ requirePageRole: vi.fn() }));
vi.mock('../../../lib/session', () => ({ requirePageRole: session.requirePageRole }));

const { default: MenteeHomePage } = await import('./page');

beforeEach(() => {
  vi.clearAllMocks();
  session.requirePageRole.mockResolvedValue({ userId: 'u-1', roles: ['mentee'] });
});

describe('mentee home page', () => {
  it('enforces the mentee role at the page, not only at the layout', async () => {
    await MenteeHomePage();

    expect(session.requirePageRole).toHaveBeenCalledWith('mentee', '/home');
  });

  it('renders an empty session list that says why it is empty', async () => {
    const tree = await MenteeHomePage();
    const empty = elements(tree).find((element) => element.type === EmptyState);

    expect(text(tree)).toContain('My sessions');
    expect((empty?.props as { title: string }).title).toBe('No sessions yet');
    expect((empty?.props as { description: string }).description).toContain(
      'not available yet',
    );
  });

  it('renders nothing when the guard refuses', async () => {
    session.requirePageRole.mockRejectedValue(new RedirectSentinel('NEXT_REDIRECT'));

    await expect(MenteeHomePage()).rejects.toBeInstanceOf(RedirectSentinel);
  });
});
