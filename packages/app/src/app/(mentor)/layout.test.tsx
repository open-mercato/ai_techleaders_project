import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SignOutAction } from '@devmentor/ui';
import { elements, text } from '../../test/element-tree';

/** The mentor layout, invoked directly. Same two branches as the mentee layout. */

class RedirectSentinel extends Error {}

const session = vi.hoisted(() => ({ requirePageRole: vi.fn() }));
vi.mock('../../lib/session', () => ({ requirePageRole: session.requirePageRole }));

const { default: MentorLayout } = await import('./layout');

beforeEach(() => {
  vi.clearAllMocks();
  session.requirePageRole.mockResolvedValue({ userId: 'u-2', roles: ['mentor'] });
});

describe('mentor layout', () => {
  it('requires the mentor role for its own segment', async () => {
    await MentorLayout({ children: 'page' });

    expect(session.requirePageRole).toHaveBeenCalledWith('mentor', '/mentor');
  });

  it('renders the page inside chrome that can sign out', async () => {
    const tree = await MentorLayout({ children: 'page' });

    expect(text(tree)).toContain('page');
    expect(elements(tree).some((element) => element.type === SignOutAction)).toBe(true);
  });

  it('renders nothing when the guard refuses', async () => {
    session.requirePageRole.mockRejectedValue(new RedirectSentinel('NEXT_REDIRECT'));

    await expect(MentorLayout({ children: 'page' })).rejects.toBeInstanceOf(RedirectSentinel);
  });
});
