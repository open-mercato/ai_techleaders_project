import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmptyState } from '@devmentor/ui/backend';
import { elements, text } from '../../../test/element-tree';
import { MentorOnboardingStatus } from './mentor-onboarding-status';

/** `/mentor` invoked directly — the mentor half of the same page-level enforcement. */

class RedirectSentinel extends Error {}

const session = vi.hoisted(() => ({ requirePageRole: vi.fn() }));
vi.mock('../../../lib/session', () => ({ requirePageRole: session.requirePageRole }));

const { default: MentorHomePage } = await import('./page');

beforeEach(() => {
  vi.clearAllMocks();
  session.requirePageRole.mockResolvedValue({ userId: 'u-2', roles: ['mentor'] });
});

describe('mentor home page', () => {
  it('enforces the mentor role at the page, not only at the layout', async () => {
    await MentorHomePage();

    expect(session.requirePageRole).toHaveBeenCalledWith('mentor', '/mentor');
  });

  it('points a mentor at their booked sessions rather than an empty request list', async () => {
    const tree = await MentorHomePage();
    const empty = elements(tree).find((element) => element.type === EmptyState);

    expect(text(tree)).toContain('Mentor workspace');
    expect(elements(tree).some((element) => element.type === MentorOnboardingStatus)).toBe(true);
    expect((empty?.props as { title: string }).title)
      .toBe('Your booked sessions are on their own screen');
    expect((empty?.props as { description: string }).description).toContain(
      'Open Booked sessions',
    );
  });

  it('renders nothing when the guard refuses', async () => {
    session.requirePageRole.mockRejectedValue(new RedirectSentinel('NEXT_REDIRECT'));

    await expect(MentorHomePage()).rejects.toBeInstanceOf(RedirectSentinel);
  });
});
