import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceShell } from '../../components/workspace-shell';
import { elements, text } from '../../test/element-tree';

/**
 * The mentor layout, invoked directly — the same three questions as the mentee layout, with
 * the role and the segment that make it a separate route group.
 *
 * The session it is asserted against holds `mentor` **and** `operator`, because that is the
 * combination the seeded `mock-operator` has: the layout must pass the whole role set
 * through rather than the one role it guarded on, or the combined-role navigation below it
 * would lose the surface the user did not enter through.
 */

class RedirectSentinel extends Error {}

const session = vi.hoisted(() => ({ requirePageRole: vi.fn() }));
vi.mock('../../lib/session', () => ({ requirePageRole: session.requirePageRole }));

const { default: MentorLayout } = await import('./layout');

const combinedSession = { userId: 'u-4', roles: ['operator', 'mentor'] };

beforeEach(() => {
  vi.clearAllMocks();
  session.requirePageRole.mockResolvedValue(combinedSession);
});

describe('mentor layout', () => {
  it('requires the mentor role for its own segment', async () => {
    await MentorLayout({ children: 'page' });

    expect(session.requirePageRole).toHaveBeenCalledWith('mentor', '/mentor');
  });

  it('renders the page inside the workspace shell for the guarded session', async () => {
    const tree = await MentorLayout({ children: 'page' });
    const shell = elements(tree).find((element) => element.type === WorkspaceShell);

    // Every held role, not just the guarded one.
    expect(shell?.props).toMatchObject({ session: combinedSession });
    expect(text(tree)).toContain('page');
  });

  it('renders nothing when the guard refuses', async () => {
    session.requirePageRole.mockRejectedValue(new RedirectSentinel('NEXT_REDIRECT'));

    await expect(MentorLayout({ children: 'page' })).rejects.toBeInstanceOf(RedirectSentinel);
  });
});
