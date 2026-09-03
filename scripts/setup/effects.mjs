import { spawn } from 'node:child_process';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { connect } from 'node:net';

/** Exit code reported when a command could not be launched at all (e.g. ENOENT). */
export const SPAWN_FAILED = -1;

/**
 * Real-world effects for the installer.
 *
 * `run.mjs` takes this object as its only argument so every step can be exercised in
 * unit tests against fakes. Each function here is a thin adapter over a `node:*`
 * built-in and contains no decision logic of its own — the decisions live in
 * `steps.mjs`.
 *
 * @typedef {object} SetupEffects
 * @property {(command: string, args: string[]) => Promise<{code: number, stdout: string, stderr: string}>} run
 * @property {(path: string) => Promise<string|null>} readText
 * @property {(path: string, text: string) => Promise<void>} writeText
 * @property {(path: string) => Promise<number|null>} mtime
 * @property {(host: string, port: number, timeoutMs: number) => Promise<boolean>} probeTcp
 * @property {(line: string) => void} log
 * @property {(ms: number) => Promise<void>} sleep
 * @property {string} nodeVersion
 * @property {string} platform
 * @property {Record<string, string|undefined>} env
 */

/**
 * @returns {SetupEffects}
 */
export function createNodeEffects() {
  return {
    /**
     * Run a command to completion, inheriting stdin and streaming nothing: stdout and
     * stderr are captured so a failing step can report why. Never uses a shell, so no
     * argument needs quoting.
     */
    run: (command, args) =>
      new Promise((resolve) => {
        const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'] });
        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (chunk) => {
          stdout += String(chunk);
        });
        child.stderr.on('data', (chunk) => {
          stderr += String(chunk);
        });
        // A command that cannot be launched at all (Docker not installed) is an
        // expected condition here, not an exception: report it as a failed exit so
        // the calling step can print its own actionable message instead of a stack.
        child.on('error', (error) => {
          resolve({ code: SPAWN_FAILED, stdout, stderr: error.message });
        });
        child.on('close', (code) => resolve({ code: code ?? 0, stdout, stderr }));
      }),

    /** Read a UTF-8 file, or `null` when it does not exist. */
    readText: (path) => readFile(path, 'utf8').catch(() => null),

    writeText: (path, text) => writeFile(path, text, 'utf8'),

    /** Modification time in epoch milliseconds, or `null` when the path is absent. */
    mtime: (path) =>
      stat(path)
        .then((stats) => stats.mtimeMs)
        .catch(() => null),

    /**
     * Is something accepting TCP connections at this address? Used to detect a
     * PostgreSQL that is already running — from Docker, a native install, or a remote
     * server — so setup can reuse it instead of requiring Docker.
     */
    probeTcp: (host, port, timeoutMs) =>
      new Promise((resolve) => {
        const socket = connect({ host, port });

        /** @param {boolean} reachable */
        const settle = (reachable) => {
          socket.destroy();
          resolve(reachable);
        };
        // A refused connection, an unresolvable host, and a silent drop are the same
        // answer here: nothing usable is listening.
        const unreachable = () => settle(false);

        socket.setTimeout(timeoutMs, unreachable);
        socket.once('error', unreachable);
        socket.once('connect', () => settle(true));
      }),

    log: (line) => {
      console.log(line);
    },

    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),

    nodeVersion: process.version,

    platform: process.platform,

    env: process.env,
  };
}
