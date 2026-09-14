import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Cradle } from '@devmentor/core';

const core = vi.hoisted(() => ({ withScope: vi.fn(), runDue: vi.fn() }));
vi.mock('@devmentor/core', () => ({ withScope: core.withScope }));

const { main } = await import('./payouts-run');

const write = vi.spyOn(process.stdout, 'write').mockReturnValue(true);

beforeEach(() => {
  vi.clearAllMocks();
  core.runDue.mockResolvedValue({ transferred: 2, held: 1, failed: 0 });
  core.withScope.mockImplementation((run: (cradle: Cradle) => unknown) =>
    run({ payoutService: { runDue: core.runDue } } as unknown as Cradle));
});

afterEach(() => write.mockClear());

describe('payouts:run', () => {
  it('runs the due payouts in their own scope and reports what happened', async () => {
    await expect(main()).resolves.toEqual({ transferred: 2, held: 1, failed: 0 });

    expect(core.runDue).toHaveBeenCalledExactlyOnceWith();
    expect(write).toHaveBeenCalledWith('payouts: 2 transferred, 1 held, 0 failed\n');
  });

  it('says plainly when there was nothing to pay', async () => {
    core.runDue.mockResolvedValue({ transferred: 0, held: 0, failed: 0 });

    await main();

    expect(write).toHaveBeenCalledWith('payouts: 0 transferred, 0 held, 0 failed\n');
  });
});
