import { beforeEach, describe, expect, it, vi } from 'vitest';
import { elements, text } from '../../../../test/element-tree';
import { MentorSlotsClient } from './mentor-slots-client';

class RedirectSentinel extends Error {}

const harness = vi.hoisted(() => ({ requirePageRole: vi.fn() }));
vi.mock('../../../../lib/session', () => ({ requirePageRole: harness.requirePageRole }));

const { default: MentorSlotsPage } = await import('./page');

beforeEach(() => {
  vi.clearAllMocks();
  harness.requirePageRole.mockResolvedValue({ userId: 'mentor-1', roles: ['mentor'] });
});

describe('/mentor/slots page', () => {
  it('guards the page and mounts the slot manager inside the mentor surface', async () => {
    const tree = await MentorSlotsPage();
    expect(harness.requirePageRole).toHaveBeenCalledWith('mentor', '/mentor/slots');
    expect(text(tree)).toContain('Available times');
    expect(elements(tree).some((element) => element.type === MentorSlotsClient)).toBe(true);
  });

  it('returns no page tree when the mentor guard redirects', async () => {
    harness.requirePageRole.mockRejectedValue(new RedirectSentinel('NEXT_REDIRECT'));
    await expect(MentorSlotsPage()).rejects.toBeInstanceOf(RedirectSentinel);
  });
});
