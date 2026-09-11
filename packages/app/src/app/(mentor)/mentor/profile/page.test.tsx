import { beforeEach, describe, expect, it, vi } from 'vitest';
import { elements, text } from '../../../../test/element-tree';
import { MentorProfileClient } from './mentor-profile-client';

class RedirectSentinel extends Error {}

const harness = vi.hoisted(() => ({ requirePageRole: vi.fn() }));
vi.mock('../../../../lib/session', () => ({ requirePageRole: harness.requirePageRole }));
vi.mock('@devmentor/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@devmentor/core')>()),
  getEnv: () => ({ APP_URL: 'http://localhost:3000' }),
}));

const { default: MentorProfilePage } = await import('./page');

beforeEach(() => {
  vi.clearAllMocks();
  harness.requirePageRole.mockResolvedValue({ userId: 'mentor-1', roles: ['mentor'] });
});

describe('/mentor/profile page', () => {
  it('enforces the mentor role and supplies config-owned stack choices to the client', async () => {
    const tree = await MentorProfilePage();
    expect(harness.requirePageRole).toHaveBeenCalledWith('mentor', '/mentor/profile');
    expect(text(tree)).toContain('Mentor profile');
    const client = elements(tree).find((element) => element.type === MentorProfileClient);
    expect(client?.props).toMatchObject({
      appUrl: 'http://localhost:3000',
      stackOptions: [
        { label: 'TypeScript', value: 'TypeScript' },
        { label: 'React', value: 'React' },
        { label: 'Python', value: 'Python' },
        { label: 'AI agents', value: 'AI agents' },
      ],
    });
  });

  it('renders nothing when the page-level guard refuses', async () => {
    harness.requirePageRole.mockRejectedValue(new RedirectSentinel('NEXT_REDIRECT'));
    await expect(MentorProfilePage()).rejects.toBeInstanceOf(RedirectSentinel);
  });
});
