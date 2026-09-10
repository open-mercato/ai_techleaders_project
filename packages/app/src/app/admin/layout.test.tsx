import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceShell } from '../../components/workspace-shell';
import { elements, text } from '../../test/element-tree';

/**
 * The admin layout, invoked directly.
 *
 * Two things are asserted and both are load-bearing: the operator guard still runs before
 * any chrome renders, and the chrome is now `AppShell` fed by the guard's session. The
 * bespoke sidebar's links moved with it — `admin.integration.test.ts` asserts an accessible
 * `link "Users"`, and `nav.test.ts` plus `workspace-shell.test.tsx` are where that link is
 * now pinned.
 */

class RedirectSentinel extends Error {}

const session = vi.hoisted(() => ({ requirePageRole: vi.fn() }));
vi.mock('../../lib/session', () => ({ requirePageRole: session.requirePageRole }));

const { default: AdminLayout } = await import('./layout');

const operatorSession = { userId: 'u-3', roles: ['operator', 'mentor'] };

beforeEach(() => {
  vi.clearAllMocks();
  session.requirePageRole.mockResolvedValue(operatorSession);
});

describe('admin layout', () => {
  it('requires the operator role for its own segment', async () => {
    await AdminLayout({ children: 'page' });

    expect(session.requirePageRole).toHaveBeenCalledWith('operator', '/admin');
  });

  it('renders the page inside the workspace shell for the guarded session', async () => {
    const tree = await AdminLayout({ children: 'page' });
    const shell = elements(tree).find((element) => element.type === WorkspaceShell);

    // The whole role set, so an operator who also mentors keeps both surfaces in view.
    expect(shell?.props).toMatchObject({ session: operatorSession });
    expect(text(tree)).toContain('page');
  });

  it('renders nothing when the guard refuses', async () => {
    session.requirePageRole.mockRejectedValue(new RedirectSentinel('NEXT_REDIRECT'));

    await expect(AdminLayout({ children: 'page' })).rejects.toBeInstanceOf(RedirectSentinel);
  });
});
