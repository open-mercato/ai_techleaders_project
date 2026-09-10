import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SignOutAction } from '@devmentor/ui';
import { elements, text } from '../../test/element-tree';

/**
 * The mentee layout, invoked directly. Both branches matter and only one of them returns a
 * tree: `requirePageRole` throws on a refusal, exactly as `redirect()` does, so the denied
 * case is asserted as the sentinel rather than as an empty render.
 */

class RedirectSentinel extends Error {}

const session = vi.hoisted(() => ({ requirePageRole: vi.fn() }));
vi.mock('../../lib/session', () => ({ requirePageRole: session.requirePageRole }));

const { default: MenteeLayout } = await import('./layout');

beforeEach(() => {
  vi.clearAllMocks();
  session.requirePageRole.mockResolvedValue({ userId: 'u-1', roles: ['mentee'] });
});

describe('mentee layout', () => {
  it('requires the mentee role for its own segment', async () => {
    await MenteeLayout({ children: 'page' });

    expect(session.requirePageRole).toHaveBeenCalledWith('mentee', '/home');
  });

  it('renders the page inside chrome that can sign out', async () => {
    const tree = await MenteeLayout({ children: 'page' });

    expect(text(tree)).toContain('page');
    expect(elements(tree).some((element) => element.type === SignOutAction)).toBe(true);
  });

  it('renders nothing when the guard refuses', async () => {
    session.requirePageRole.mockRejectedValue(new RedirectSentinel('NEXT_REDIRECT'));

    await expect(MenteeLayout({ children: 'page' })).rejects.toBeInstanceOf(RedirectSentinel);
  });
});
