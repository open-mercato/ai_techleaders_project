import { dirname, join, parse, resolve } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { findPnpAncestor, runStorybook } from './run.mjs';

const safeDirectory = resolve('/safe/storybook-run');
const nodeExecutable = resolve('/node');
const storybookExecutable = resolve('/repo/node_modules/storybook/bin.js');
const configDirectory = resolve('/repo/packages/ui/.storybook');
const outputDirectory = resolve('/repo/packages/ui/storybook-static');

describe('findPnpAncestor', () => {
  it('finds the nearest .pnp.cjs manifest', async () => {
    const start = resolve('/work/project/.storybook-cache');
    const manifest = join(resolve('/work'), '.pnp.cjs');

    await expect(findPnpAncestor(start, async (path) => path === manifest)).resolves.toBe(manifest);
  });

  it('also recognizes the legacy .pnp.js filename', async () => {
    const start = resolve('/work/project');
    const manifest = join(start, '.pnp.js');

    await expect(findPnpAncestor(start, async (path) => path === manifest)).resolves.toBe(manifest);
  });

  it('stops cleanly at the filesystem root', async () => {
    const root = parse(resolve('/work/project')).root;
    const fileExists = vi.fn().mockResolvedValue(false);

    await expect(findPnpAncestor(root, fileExists)).resolves.toBeNull();
    expect(fileExists).toHaveBeenCalledTimes(2);
  });
});

function fakeEffects(overrides = {}) {
  return {
    prepareWorkingDirectory: vi.fn().mockResolvedValue(safeDirectory),
    fileExists: vi.fn().mockResolvedValue(false),
    run: vi.fn().mockResolvedValue(0),
    nodeExecutable,
    storybookExecutable,
    configDirectory,
    outputDirectory,
    ...overrides,
  };
}

describe('runStorybook', () => {
  it('runs the installed CLI outside the repository with its absolute config', async () => {
    const effects = fakeEffects();

    await expect(runStorybook(['dev', '--port', '6006'], effects)).resolves.toBe(0);
    expect(effects.run).toHaveBeenCalledWith(
      nodeExecutable,
      [
        storybookExecutable,
        'dev',
        '--port',
        '6006',
        '--config-dir',
        configDirectory,
      ],
      safeDirectory,
    );
  });

  it('refuses a temporary directory that is itself under another PnP tree', async () => {
    const effects = fakeEffects({
      fileExists: vi.fn(async (path) => path === join(dirname(safeDirectory), '.pnp.cjs')),
    });

    await expect(runStorybook(['build'], effects)).rejects.toThrow('.pnp.cjs');
    expect(effects.run).not.toHaveBeenCalled();
  });

  it('keeps static build output in the UI workspace instead of the temporary directory', async () => {
    const effects = fakeEffects();

    await runStorybook(['build', '--disable-telemetry'], effects);

    expect(effects.run).toHaveBeenCalledWith(
      nodeExecutable,
      [
        storybookExecutable,
        'build',
        '--disable-telemetry',
        '--output-dir',
        outputDirectory,
        '--config-dir',
        configDirectory,
      ],
      safeDirectory,
    );
  });

  it('surfaces an error when Storybook cannot launch', async () => {
    const effects = fakeEffects({ run: vi.fn().mockRejectedValue(new Error('spawn failed')) });

    await expect(runStorybook(['dev'], effects)).rejects.toThrow('spawn failed');
  });
});
