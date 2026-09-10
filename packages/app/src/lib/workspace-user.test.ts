import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The display-name lookup, with the container and the ORM mocked out: this module's whole
 * job is "open a system scope, read one column, and say something honest when the row is
 * gone", and all three are decisions worth pinning without a database.
 */

const core = vi.hoisted(() => ({ withScope: vi.fn() }));
const db = vi.hoisted(() => ({ User: { name: 'User' } }));

vi.mock('@devmentor/core', () => ({ withScope: core.withScope }));
vi.mock('@devmentor/db', () => ({ User: db.User }));

const { displayNameFor } = await import('./workspace-user');

/** Run the callback `displayNameFor` hands to `withScope` against a stub `EntityManager`. */
function withEmReturning(user: { displayName: string } | null) {
  const findOne = vi.fn().mockResolvedValue(user);
  core.withScope.mockImplementation((fn: (cradle: { em: { findOne: unknown } }) => unknown) =>
    fn({ em: { findOne } }),
  );
  return findOne;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('displayNameFor', () => {
  it('reads the display name of the requested user', async () => {
    const findOne = withEmReturning({ displayName: 'Mock Operator' });

    await expect(displayNameFor('u-9')).resolves.toBe('Mock Operator');
    expect(findOne).toHaveBeenCalledWith(db.User, { id: 'u-9' }, { fields: ['displayName'] });
  });

  it('says the name is unavailable when the row is gone', async () => {
    // Only reachable if the account disappears between the guard's lookup and this one.
    // The shell still renders; it does not invent a name or print the raw id.
    withEmReturning(null);

    await expect(displayNameFor('u-9')).resolves.toBe('Name unavailable');
  });
});
