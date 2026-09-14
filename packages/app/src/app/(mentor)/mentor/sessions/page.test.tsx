import { beforeEach, describe, expect, it, vi } from 'vitest';
import { elements, text } from '../../../../test/element-tree';
import { SessionsList } from '../../../../components/sessions-list';

class RedirectSentinel extends Error {}

const session = vi.hoisted(() => ({ requirePageRole: vi.fn() }));
vi.mock('../../../../lib/session', () => ({ requirePageRole: session.requirePageRole }));

const { default: MentorSessionsPage } = await import('./page');

beforeEach(() => {
  vi.clearAllMocks();
  session.requirePageRole.mockResolvedValue({ userId: 'u-1', roles: ['mentor'] });
});

describe('mentor sessions page', () => {
  it('enforces the mentor role at the page, not only at the layout', async () => {
    await MentorSessionsPage();

    expect(session.requirePageRole).toHaveBeenCalledWith('mentor', '/mentor/sessions');
  });

  it('shows the mentor the sessions booked with them', async () => {
    const tree = await MentorSessionsPage();
    const list = elements(tree).find((element) => element.type === SessionsList);

    expect(text(tree)).toContain('Booked sessions');
    // Scoping is the route's decision, from the session: there is no mentor id here.
    expect((list?.props as { as: string }).as).toBe('mentor');
    expect((list?.props as { emptyTitle: string }).emptyTitle).toBe('No sessions booked yet');
  });

  it('renders nothing when the guard refuses', async () => {
    session.requirePageRole.mockRejectedValue(new RedirectSentinel('NEXT_REDIRECT'));

    await expect(MentorSessionsPage()).rejects.toBeInstanceOf(RedirectSentinel);
  });
});
