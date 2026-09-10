import { spawn } from 'node:child_process';
import { access, mkdir, readFileSync } from 'node:fs';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const accessAsync = promisify(access);
const mkdirAsync = promisify(mkdir);
const SIGNAL_EXIT_CODES = { SIGINT: 130, SIGTERM: 143 };

/**
 * Keep the launcher alive long enough to forward termination to Storybook instead of
 * leaving its server process and port behind when only the wrapper receives a signal.
 *
 * @param {typeof spawn} spawnProcess
 * @param {NodeJS.Process} hostProcess
 * @param {string} command
 * @param {string[]} args
 * @param {string} cwd
 * @returns {Promise<number>}
 */
export function runChild(spawnProcess, hostProcess, command, args, cwd) {
  return new Promise((resolveExit, reject) => {
    const child = spawnProcess(command, args, { cwd, stdio: 'inherit' });
    const forwardSigint = () => child.kill('SIGINT');
    const forwardSigterm = () => child.kill('SIGTERM');
    const removeSignalHandlers = () => {
      hostProcess.off('SIGINT', forwardSigint);
      hostProcess.off('SIGTERM', forwardSigterm);
    };

    hostProcess.once('SIGINT', forwardSigint);
    hostProcess.once('SIGTERM', forwardSigterm);
    child.once('error', (error) => {
      removeSignalHandlers();
      reject(error);
    });
    child.once('close', (code, signal) => {
      removeSignalHandlers();
      resolveExit(code ?? SIGNAL_EXIT_CODES[signal] ?? 1);
    });
  });
}

/**
 * Real-world adapters used by the Storybook launcher.
 *
 * @typedef {object} StorybookEffects
 * @property {() => Promise<string>} prepareWorkingDirectory
 * @property {(path: string) => Promise<boolean>} fileExists
 * @property {(command: string, args: string[], cwd: string) => Promise<number>} run
 * @property {string} nodeExecutable
 * @property {string} storybookExecutable
 * @property {string} configDirectory
 * @property {string} outputDirectory
 */

/** @returns {StorybookEffects} */
export function createNodeEffects() {
  const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const uiDirectory = join(repository, 'packages/ui');
  const requireFromUi = createRequire(join(uiDirectory, 'package.json'));
  const storybookPackagePath = requireFromUi.resolve('storybook/package.json');
  const storybookPackage = JSON.parse(readFileSync(storybookPackagePath, 'utf8'));
  const workingDirectory = join(tmpdir(), 'devmentor-storybook-npm');

  return {
    prepareWorkingDirectory: async () => {
      await mkdirAsync(workingDirectory, { recursive: true });
      return workingDirectory;
    },
    fileExists: (path) => accessAsync(path).then(
      () => true,
      () => false,
    ),
    run: (command, args, cwd) => runChild(spawn, process, command, args, cwd),
    nodeExecutable: process.execPath,
    storybookExecutable: resolve(dirname(storybookPackagePath), storybookPackage.bin),
    configDirectory: join(uiDirectory, '.storybook'),
    outputDirectory: join(uiDirectory, 'storybook-static'),
  };
}
