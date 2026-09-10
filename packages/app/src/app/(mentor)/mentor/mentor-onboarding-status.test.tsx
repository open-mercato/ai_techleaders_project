// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ApiResult } from '@devmentor/ui/backend';
import { apiCall } from '@devmentor/ui/backend';
import { MentorOnboardingStatus } from './mentor-onboarding-status';

vi.mock('@devmentor/ui/backend', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@devmentor/ui/backend')>()),
  apiCall: vi.fn(),
}));

const request = vi.mocked(apiCall);

beforeEach(() => request.mockReset());
afterEach(cleanup);

describe('MentorOnboardingStatus', () => {
  it('loads the durable deadline and renders it through LocalTime', async () => {
    request.mockResolvedValue({
      ok: true,
      data: { initialPublishDueAt: '2026-09-24T12:00:00.000Z' },
    });
    render(<MentorOnboardingStatus />);
    expect(screen.getByRole('status').textContent).toContain('Loading your publication deadline');
    expect(await screen.findByText(/Publish at least one bookable session by/)).toBeTruthy();
    expect(request).toHaveBeenCalledWith('/api/mentors/me/onboarding');
  });

  it('shows the API failure and renders nothing when no deadline exists', async () => {
    request.mockResolvedValueOnce({
      ok: false,
      error: { code: 'network_error', message: 'Could not load the deadline.' },
    });
    const first = render(<MentorOnboardingStatus />);
    expect((await screen.findByRole('alert')).textContent).toContain('Could not load the deadline.');
    first.unmount();

    request.mockResolvedValueOnce({ ok: true, data: { initialPublishDueAt: null } });
    const second = render(<MentorOnboardingStatus />);
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    expect(second.container.innerHTML).toBe('');
  });

  it('ignores a response that arrives after unmount', async () => {
    let release!: (value: ApiResult<{ initialPublishDueAt: string | null }>) => void;
    request.mockReturnValue(new Promise((resolve) => (release = resolve)));
    const view = render(<MentorOnboardingStatus />);
    view.unmount();
    release({ ok: true, data: { initialPublishDueAt: null } });
    await Promise.resolve();
    expect(view.container.innerHTML).toBe('');
  });
});
