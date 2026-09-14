import { beforeEach, describe, expect, it, vi } from 'vitest';
import { elements, text } from '../../../../test/element-tree';
import { PayoutsList } from '../../../../components/payouts-list';

class RedirectSentinel extends Error {}

const session = vi.hoisted(() => ({ requirePageRole: vi.fn() }));
vi.mock('../../../../lib/session', () => ({ requirePageRole: session.requirePageRole }));

const { default: MentorPayoutsPage } = await import('./page');

beforeEach(() => {
  vi.clearAllMocks();
  session.requirePageRole.mockResolvedValue({ userId: 'u-1', roles: ['mentor'] });
});

describe('mentor payouts page', () => {
  it('enforces the mentor role at the page, not only at the layout', async () => {
    await MentorPayoutsPage();

    expect(session.requirePageRole).toHaveBeenCalledWith('mentor', '/mentor/payouts');
  });

  it('says the platform takes a fee rather than leaving the mentor to work it out', async () => {
    const tree = await MentorPayoutsPage();

    expect(text(tree)).toContain('Payouts');
    expect(text(tree)).toContain('platform fee');
    expect(elements(tree).some((element) => element.type === PayoutsList)).toBe(true);
  });

  it('renders nothing when the guard refuses', async () => {
    session.requirePageRole.mockRejectedValue(new RedirectSentinel('NEXT_REDIRECT'));

    await expect(MentorPayoutsPage()).rejects.toBeInstanceOf(RedirectSentinel);
  });
});
