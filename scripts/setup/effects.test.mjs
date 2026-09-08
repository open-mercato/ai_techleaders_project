import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { SPAWN_FAILED, createNodeEffects } from './effects.mjs';

/**
 * Listen on an ephemeral port and hand back the port plus a closer.
 *
 * @returns {Promise<{port: number, close: () => Promise<void>}>}
 */
function listenOnEphemeralPort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        port: typeof address === 'object' && address !== null ? address.port : 0,
        close: () => new Promise((closed) => server.close(() => closed())),
      });
    });
  });
}

/**
 * These adapters are the installer's only contact with the outside world, so they are
 * exercised for real — against a temporary directory and a harmless `node --version`
 * child process — rather than mocked. Nothing here touches the repository.
 */
describe('createNodeEffects', () => {
  let directory;
  const effects = createNodeEffects();

  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'devmentor-setup-effects-'));
  });

  afterAll(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('reports the running Node version, platform, and environment', () => {
    expect(effects.nodeVersion).toBe(process.version);
    expect(effects.platform).toBe(process.platform);
    expect(effects.env).toBe(process.env);
  });

  it('runs a command and captures its stdout and exit code', async () => {
    const result = await effects.run(process.execPath, ['--version']);

    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toBe(process.version);
    expect(result.stderr).toBe('');
  });

  it('captures a non-zero exit code and stderr', async () => {
    const result = await effects.run(process.execPath, [
      '-e',
      'process.stderr.write("nope"); process.exit(3);',
    ]);

    expect(result.code).toBe(3);
    expect(result.stderr).toBe('nope');
  });

  it('reports code 0 when a process is killed without an exit code', async () => {
    const result = await effects.run(process.execPath, ['-e', 'process.kill(process.pid)']);

    expect(result.code).toBe(0);
  });

  it('reports a launch failure as a failed exit instead of throwing', async () => {
    // A missing binary (no Docker installed) is an expected condition for the
    // installer, so it must arrive as data the calling step can act on.
    const result = await effects.run(join(directory, 'definitely-not-a-real-binary'), []);

    expect(result.code).toBe(SPAWN_FAILED);
    expect(result.stderr).toContain('ENOENT');
  });

  it('detects a port that is accepting connections', async () => {
    const server = await listenOnEphemeralPort();

    try {
      await expect(effects.probeTcp('127.0.0.1', server.port, 2_000)).resolves.toBe(true);
    } finally {
      await server.close();
    }
  });

  it('reports a port that refuses connections as unreachable', async () => {
    const server = await listenOnEphemeralPort();
    await server.close();

    await expect(effects.probeTcp('127.0.0.1', server.port, 2_000)).resolves.toBe(false);
  });

  it('reports an unresolvable host as unreachable', async () => {
    await expect(
      effects.probeTcp('devmentor-host-that-does-not-exist.invalid', 5432, 2_000),
    ).resolves.toBe(false);
  });

  it('reads a file back as text', async () => {
    const path = join(directory, 'readable.txt');
    await writeFile(path, 'hello', 'utf8');

    await expect(effects.readText(path)).resolves.toBe('hello');
  });

  it('returns null instead of throwing for a missing file', async () => {
    await expect(effects.readText(join(directory, 'absent.txt'))).resolves.toBeNull();
  });

  it('writes text that reads back identically', async () => {
    const path = join(directory, 'written.txt');

    await effects.writeText(path, 'written');

    await expect(effects.readText(path)).resolves.toBe('written');
  });

  it('reports a modification time for an existing file', async () => {
    const path = join(directory, 'stamped.txt');
    await writeFile(path, 'x', 'utf8');

    await expect(effects.mtime(path)).resolves.toBeTypeOf('number');
  });

  it('returns null for the modification time of a missing file', async () => {
    await expect(effects.mtime(join(directory, 'ghost.txt'))).resolves.toBeNull();
  });

  it('logs through the console', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});

    effects.log('a line');

    expect(spy).toHaveBeenCalledWith('a line');
    spy.mockRestore();
  });

  it('sleeps for the requested delay', async () => {
    await expect(effects.sleep(1)).resolves.toBeUndefined();
  });
});
