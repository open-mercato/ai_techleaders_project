import { describe, expect, it, vi } from 'vitest';

const runSetup = vi.fn().mockResolvedValue(0);
const createNodeEffects = vi.fn().mockReturnValue({ marker: 'effects' });

vi.mock('./run.mjs', () => ({ runSetup }));
vi.mock('./effects.mjs', () => ({ createNodeEffects }));

/**
 * The entry point is pure composition, so it is verified by importing it with the two
 * modules it wires together mocked out — proving it hands the real effects to
 * `runSetup` and surfaces the result as the process exit code, without running any
 * step for real.
 */
describe('setup entry point', () => {
  it('runs the installer with real effects and reports the exit code', async () => {
    const original = process.exitCode;
    runSetup.mockResolvedValueOnce(0);

    await import('./index.mjs');

    expect(createNodeEffects).toHaveBeenCalledOnce();
    expect(runSetup).toHaveBeenCalledWith({ marker: 'effects' });
    expect(process.exitCode).toBe(0);

    process.exitCode = original;
  });
});
