import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceShell } from '../../components/workspace-shell';
import { elements, text } from '../../test/element-tree';

/**
 * The mentee layout, invoked directly. Both branches matter and only one of them returns a
 * tree: `requirePageRole` throws on a refusal, exactly as `redirect()` does, so the denied
 * case is asserted as the sentinel rather than as an empty render.
 *
 * After the Slice 3 port the layout makes exactly two decisions — which guard, and that the
 * guard's session is what the chrome is built from. `WorkspaceShell` is not rendered here;
 * which links that session produces is its own test's question.
 */

class RedirectSentinel extends Error {}

const session = vi.hoisted(() => ({ requirePageRole: vi.fn() }));
vi.mock('../../lib/session', () => ({ requirePageRole: session.requirePageRole }));

const { default: MenteeLayout } = await import('./layout');

const menteeSession = { userId: 'u-1', roles: ['mentee'] };

beforeEach(() => {
  vi.clearAllMocks();
  session.requirePageRole.mockResolvedValue(menteeSession);
});

describe('mentee layout', () => {
  it('requires the mentee role for its own segment', async () => {
    await MenteeLayout({ children: 'page' });

    expect(session.requirePageRole).toHaveBeenCalledWith('mentee', '/home');
  });

  it('renders the page inside the workspace shell for the guarded session', async () => {
    const tree = await MenteeLayout({ children: 'page' });
    const shell = elements(tree).find((element) => element.type === WorkspaceShell);

    // The guard's own return value, not a second session resolution.
    expect(shell?.props).toMatchObject({ session: menteeSession });
    expect(text(tree)).toContain('page');
  });

  it('renders nothing when the guard refuses', async () => {
    session.requirePageRole.mockRejectedValue(new RedirectSentinel('NEXT_REDIRECT'));

    await expect(MenteeLayout({ children: 'page' })).rejects.toBeInstanceOf(RedirectSentinel);
  });
});
