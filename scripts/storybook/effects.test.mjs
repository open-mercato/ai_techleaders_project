import { writeFile } from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createNodeEffects, runChild } from './effects.mjs';

function fakeChild() {
  const child = new EventEmitter();
  child.kill = vi.fn();
  return child;
}

describe('runChild', () => {
  it('forwards SIGINT, waits for the child, and restores the host signal handlers', async () => {
    const host = new EventEmitter();
    const child = fakeChild();
    const spawnProcess = vi.fn(() => child);
    const result = runChild(spawnProcess, host, '/node', ['storybook'], '/tmp/run');

    expect(spawnProcess).toHaveBeenCalledWith(
      '/node',
      ['storybook'],
      { cwd: '/tmp/run', stdio: 'inherit' },
    );
    host.emit('SIGINT');
    expect(child.kill).toHaveBeenCalledWith('SIGINT');
    child.emit('close', null, 'SIGINT');

    await expect(result).resolves.toBe(130);
    expect(host.listenerCount('SIGINT')).toBe(0);
    expect(host.listenerCount('SIGTERM')).toBe(0);
  });

  it('forwards SIGTERM and preserves its conventional exit status', async () => {
    const host = new EventEmitter();
    const child = fakeChild();
    const result = runChild(() => child, host, '/node', [], '/tmp/run');

    host.emit('SIGTERM');
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    child.emit('close', null, 'SIGTERM');

    await expect(result).resolves.toBe(143);
  });

  it('prefers a normal child exit code', async () => {
    const host = new EventEmitter();
    const child = fakeChild();
    const result = runChild(() => child, host, '/node', [], '/tmp/run');

    child.emit('close', 3, null);

    await expect(result).resolves.toBe(3);
  });

  it('uses a generic failure for an unknown signal', async () => {
    const host = new EventEmitter();
    const child = fakeChild();
    const result = runChild(() => child, host, '/node', [], '/tmp/run');

    child.emit('close', null, 'SIGUSR1');

    await expect(result).resolves.toBe(1);
  });

  it('restores signal handlers when spawning fails', async () => {
    const host = new EventEmitter();
    const child = fakeChild();
    const result = runChild(() => child, host, '/missing', [], '/tmp/run');

    child.emit('error', new Error('spawn failed'));

    await expect(result).rejects.toThrow('spawn failed');
    expect(host.listenerCount('SIGINT')).toBe(0);
    expect(host.listenerCount('SIGTERM')).toBe(0);
  });
});

describe('createNodeEffects', () => {
  const effects = createNodeEffects();

  it('resolves the local Storybook CLI, config, and running Node', () => {
    expect(effects.nodeExecutable).toBe(process.execPath);
    expect(effects.storybookExecutable).toContain(
      join('packages', 'ui', 'node_modules', 'storybook'),
    );
    expect(effects.storybookExecutable).toMatch(/dispatcher\.js$/);
    expect(effects.configDirectory.endsWith(join('packages', 'ui', '.storybook'))).toBe(true);
    expect(effects.outputDirectory.endsWith(join('packages', 'ui', 'storybook-static'))).toBe(true);
  });

  it('creates and inspects the isolated Storybook working directory', async () => {
    const directory = await effects.prepareWorkingDirectory();
    const marker = join(directory, 'marker');

    await writeFile(marker, 'ok');
    await expect(effects.fileExists(marker)).resolves.toBe(true);
    await expect(effects.fileExists(join(directory, 'missing'))).resolves.toBe(false);
    await expect(effects.prepareWorkingDirectory()).resolves.toBe(directory);
  });

  it('runs a child process and returns its exit code', async () => {
    await expect(
      effects.run(process.execPath, ['-e', 'process.exit(3)'], process.cwd()),
    ).resolves.toBe(3);
  });

  it('maps a signal-only child exit to a failure code', async () => {
    await expect(
      effects.run(process.execPath, ['-e', 'process.kill(process.pid)'], process.cwd()),
    ).resolves.toBe(143);
  });

  it('rejects when a child process cannot be launched', async () => {
    await expect(
      effects.run('/definitely/not/a/real/storybook-command', [], process.cwd()),
    ).rejects.toThrow();
  });
});
