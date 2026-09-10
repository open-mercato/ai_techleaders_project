import { beforeEach, describe, expect, it, vi } from 'vitest';
import { elements, text } from '../../test/element-tree';

/**
 * The admin layout, invoked directly.
 *
 * Two things are asserted and both are load-bearing: the operator guard now runs before any
 * chrome renders, and the chrome itself did **not** change — `admin.integration.test.ts`
 * asserts an accessible `link "Users"`, and Slice 3's port to `AppShell` has to keep it too.
 */

class RedirectSentinel extends Error {}

const session = vi.hoisted(() => ({ requirePageRole: vi.fn() }));
vi.mock('../../lib/session', () => ({ requirePageRole: session.requirePageRole }));

const { default: AdminLayout } = await import('./layout');

beforeEach(() => {
  vi.clearAllMocks();
  session.requirePageRole.mockResolvedValue({ userId: 'u-3', roles: ['operator'] });
});

describe('admin layout', () => {
  it('requires the operator role for its own segment', async () => {
    await AdminLayout({ children: 'page' });

    expect(session.requirePageRole).toHaveBeenCalledWith('operator', '/admin');
  });

  it('keeps the dashboard and users navigation', async () => {
    const tree = await AdminLayout({ children: 'page' });
    const hrefs = elements(tree)
      .map((element) => (element.props as { href?: string }).href)
      .filter((href): href is string => typeof href === 'string');

    expect(hrefs).toEqual(['/', '/admin', '/admin/users']);
    expect(text(tree)).toContain('Users');
    expect(text(tree)).toContain('page');
  });

  it('renders nothing when the guard refuses', async () => {
    session.requirePageRole.mockRejectedValue(new RedirectSentinel('NEXT_REDIRECT'));

    await expect(AdminLayout({ children: 'page' })).rejects.toBeInstanceOf(RedirectSentinel);
  });
});
