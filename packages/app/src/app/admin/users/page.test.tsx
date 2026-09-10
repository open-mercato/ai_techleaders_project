import { beforeEach, describe, expect, it, vi } from 'vitest';
import { elements, text } from '../../../test/element-tree';
import { UsersList } from './users-list';

/**
 * `/admin/users` invoked directly — the page edge case 21 is about.
 *
 * The shape being asserted is the reason this file exists: a Server Component that guards
 * and renders the heading, with the client table below it. A `'use client'` page could not
 * have awaited the guard at all, which is how the screen would have ended up trusting a
 * layout that does not re-run on a client-side navigation.
 */

class RedirectSentinel extends Error {}

const session = vi.hoisted(() => ({ requirePageRole: vi.fn() }));
vi.mock('../../../lib/session', () => ({ requirePageRole: session.requirePageRole }));

const { default: AdminUsersPage } = await import('./page');

beforeEach(() => {
  vi.clearAllMocks();
  session.requirePageRole.mockResolvedValue({ userId: 'u-3', roles: ['operator'] });
});

describe('admin users page', () => {
  it('enforces the operator role at the page, with its own path', async () => {
    await AdminUsersPage();

    expect(session.requirePageRole).toHaveBeenCalledWith('operator', '/admin/users');
  });

  it('renders the heading itself and delegates the table to the client list', async () => {
    const tree = await AdminUsersPage();

    expect(text(tree)).toContain('Users');
    expect(elements(tree).some((element) => element.type === UsersList)).toBe(true);
  });

  it('renders nothing when the guard refuses', async () => {
    session.requirePageRole.mockRejectedValue(new RedirectSentinel('NEXT_REDIRECT'));

    await expect(AdminUsersPage()).rejects.toBeInstanceOf(RedirectSentinel);
  });
});
