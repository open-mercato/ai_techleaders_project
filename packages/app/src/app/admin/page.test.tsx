import { beforeEach, describe, expect, it, vi } from 'vitest';
import { text } from '../../test/element-tree';

/**
 * The operator dashboard, invoked directly.
 *
 * `@devmentor/core` is mocked for the two calls this page makes: `getEnv` so the test needs
 * no environment, and `checkDbConnection` because both of its answers are rendered and the
 * unreachable-database branch is the one that must not throw (AGENTS.md: a page that touches
 * the database degrades instead of failing).
 */

class RedirectSentinel extends Error {}

const session = vi.hoisted(() => ({ requirePageRole: vi.fn(), withPageScope: vi.fn(), metricsForLastDays: vi.fn() }));
const core = vi.hoisted(() => ({ getEnv: vi.fn(), checkDbConnection: vi.fn() }));

vi.mock('../../lib/session', () => ({
  requirePageRole: session.requirePageRole,
  withPageScope: session.withPageScope,
}));
vi.mock('@devmentor/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@devmentor/core')>()),
  getEnv: core.getEnv,
  checkDbConnection: core.checkDbConnection,
}));

const { default: AdminDashboard } = await import('./page');

beforeEach(() => {
  vi.clearAllMocks();
  session.requirePageRole.mockResolvedValue({ userId: 'u-3', roles: ['operator'] });
  session.metricsForLastDays.mockResolvedValue({ weeks: [], medianBookingToStartMinutes: null });
  session.withPageScope.mockImplementation((run: (cradle: unknown) => unknown) =>
    run({ bookingService: { metricsForLastDays: session.metricsForLastDays } }));
  core.getEnv.mockReturnValue({ APP_NAME: 'DevMentor', NODE_ENV: 'test' });
  core.checkDbConnection.mockResolvedValue({ ok: true });
});

describe('admin dashboard page', () => {
  it('enforces the operator role at the page, not only at the layout', async () => {
    await AdminDashboard();

    expect(session.requirePageRole).toHaveBeenCalledWith('operator', '/admin');
  });

  it('reports a reachable database', async () => {
    expect(text(await AdminDashboard())).toContain('Connected');
  });

  it('reports an unreachable database instead of failing', async () => {
    core.checkDbConnection.mockResolvedValue({ ok: false });

    const copy = text(await AdminDashboard());

    expect(copy).toContain('Unavailable');
    expect(copy).not.toContain('Connected');
  });

  it('names the instance from the validated environment', async () => {
    expect(text(await AdminDashboard())).toContain('DevMentor');
  });

  it('renders nothing when the guard refuses', async () => {
    session.requirePageRole.mockRejectedValue(new RedirectSentinel('NEXT_REDIRECT'));

    await expect(AdminDashboard()).rejects.toBeInstanceOf(RedirectSentinel);

    expect(core.checkDbConnection).not.toHaveBeenCalled();
  });
});
