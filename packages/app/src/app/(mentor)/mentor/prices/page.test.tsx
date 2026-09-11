import { beforeEach, describe, expect, it, vi } from 'vitest';
import { elements, text } from '../../../../test/element-tree';
import { MentorPricesClient } from './mentor-prices-client';

class RedirectSentinel extends Error {}

const harness = vi.hoisted(() => ({ requirePageRole: vi.fn() }));
vi.mock('../../../../lib/session', () => ({ requirePageRole: harness.requirePageRole }));

const { default: MentorPricesPage } = await import('./page');

beforeEach(() => {
  vi.clearAllMocks();
  harness.requirePageRole.mockResolvedValue({ userId: 'mentor-1', roles: ['mentor'] });
});

describe('/mentor/prices page', () => {
  it('enforces the mentor role and renders the price client without another shell', async () => {
    const tree = await MentorPricesPage();
    expect(harness.requirePageRole).toHaveBeenCalledExactlyOnceWith('mentor', '/mentor/prices');
    expect(text(tree)).toContain('Session prices');
    expect(elements(tree).some((element) => element.type === MentorPricesClient)).toBe(true);
  });

  it('renders nothing when the page-level guard refuses', async () => {
    harness.requirePageRole.mockRejectedValue(new RedirectSentinel('NEXT_REDIRECT'));
    await expect(MentorPricesPage()).rejects.toBeInstanceOf(RedirectSentinel);
  });
});
