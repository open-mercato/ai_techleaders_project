import { describe, expect, it, vi } from 'vitest';

const effects = { marker: 'storybook effects' };
const createNodeEffects = vi.fn(() => effects);
const runStorybook = vi.fn().mockResolvedValue(0);

vi.mock('./effects.mjs', () => ({ createNodeEffects }));
vi.mock('./run.mjs', () => ({ runStorybook }));

describe('Storybook entry point', () => {
  it('forwards CLI arguments and reports the child exit code', async () => {
    const originalArgv = process.argv;
    const originalExitCode = process.exitCode;
    process.argv = ['/node', '/scripts/storybook/index.mjs', 'dev', '--port', '7000'];

    await import('./index.mjs');

    expect(createNodeEffects).toHaveBeenCalledOnce();
    expect(runStorybook).toHaveBeenCalledWith(['dev', '--port', '7000'], effects);
    expect(process.exitCode).toBe(0);

    process.argv = originalArgv;
    process.exitCode = originalExitCode;
  });
});
