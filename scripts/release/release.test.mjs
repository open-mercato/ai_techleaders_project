import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertRepositoryVersion,
  compareVersions,
  currentRepositoryVersion,
  errorMessage,
  extractReleaseNotes,
  findManifestPaths,
  main,
  parseStableVersion,
  readRepositoryVersions,
  resolveVersion,
} from './release.mjs';

const temporaryDirectories = [];

async function repositoryFixture(options = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'devmentor-release-'));
  temporaryDirectories.push(root);
  const rootVersion = options.rootVersion ?? '1.2.3';
  const appVersion = options.appVersion ?? rootVersion;
  await mkdir(path.join(root, 'packages/app'), { recursive: true });
  await writeFile(
    path.join(root, 'package.json'),
    `${JSON.stringify({ name: 'root', version: rootVersion, workspaces: options.workspaces ?? ['packages/*'] }, null, 2)}\n`,
  );
  await writeFile(
    path.join(root, 'packages/app/package.json'),
    `${JSON.stringify({ name: '@devmentor/app', version: appVersion }, null, 2)}\n`,
  );
  await writeFile(
    path.join(root, 'package-lock.json'),
    `${JSON.stringify(
      options.lockfile ?? {
        version: rootVersion,
        packages: {
          '': { name: 'root', version: rootVersion },
          'packages/app': { name: '@devmentor/app', version: appVersion },
        },
      },
      null,
      2,
    )}\n`,
  );
  await writeFile(
    path.join(root, 'CHANGELOG.md'),
    options.changelog ?? '# 1.2.3 (2026-09-15)\n\n## Features\n\n- Shipped.\n',
  );
  return root;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('stable versions', () => {
  it.each(['0.0.0', '1.2.3', '999999999999999999999999.0.1'])(
    'parses canonical stable version %s',
    (version) => expect(parseStableVersion(version)).toHaveLength(3),
  );
  it.each(['v1.2.3', '1.2', '1.2.3-beta.1', '1.2.3+build', '01.2.3', '1.02.3', '1.2.03', ' 1.2.3'])(
    'rejects non-canonical version %s',
    (version) => expect(() => parseStableVersion(version, 'candidate')).toThrow('candidate must be'),
  );
  it('compares every component without number overflow', () => {
    expect(compareVersions('2.0.0', '1.999.999')).toBe(1);
    expect(compareVersions('1.3.0', '1.2.999')).toBe(1);
    expect(compareVersions('1.2.4', '1.2.3')).toBe(1);
    expect(compareVersions('1.2.3', '1.2.3')).toBe(0);
    expect(compareVersions('1.2.2', '1.2.3')).toBe(-1);
    expect(compareVersions('1.1.999', '1.2.0')).toBe(-1);
    expect(compareVersions('999999999999999999999999.0.0', '1000000000000000000000000.0.0')).toBe(-1);
  });
  it('resolves each bump and permits an equal custom recovery version', () => {
    expect(resolveVersion('0.9.9', 'major')).toBe('1.0.0');
    expect(resolveVersion('0.9.9', 'minor')).toBe('0.10.0');
    expect(resolveVersion('0.9.9', 'patch')).toBe('0.9.10');
    expect(resolveVersion('0.9.9', 'custom', '2.3.4')).toBe('2.3.4');
    expect(resolveVersion('0.9.9', 'custom', '0.9.9')).toBe('0.9.9');
  });
  it('rejects invalid choices and custom-version combinations', () => {
    expect(() => resolveVersion('1.2.3', 'custom', '')).toThrow('custom version must be');
    expect(() => resolveVersion('1.2.3', 'custom', '1.2.2')).toThrow('cannot be lower');
    expect(() => resolveVersion('1.2.3', 'patch', '2.0.0')).toThrow('must be empty');
    expect(() => resolveVersion('1.2.3', 'banana')).toThrow('must be one of');
  });
  it('formats thrown errors and non-error failures', () => {
    expect(errorMessage(new Error('broken'))).toBe('broken');
    expect(errorMessage('broken')).toBe('broken');
  });
});

describe('repository versions', () => {
  it('discovers array and object workspace declarations in stable order', async () => {
    const root = await repositoryFixture();
    await mkdir(path.join(root, 'packages/zeta'));
    await writeFile(path.join(root, 'packages/zeta/package.json'), '{"name":"zeta","version":"1.2.3"}\n');
    expect((await findManifestPaths(root)).map(({ lockKey }) => lockKey)).toEqual(['', 'packages/app', 'packages/zeta']);
    const objectRoot = await repositoryFixture({ workspaces: { packages: ['packages/*'] } });
    expect((await findManifestPaths(objectRoot)).map(({ lockKey }) => lockKey)).toEqual(['', 'packages/app']);
  });
  it('rejects missing and unsupported workspace declarations', async () => {
    const missing = await repositoryFixture({ workspaces: [] });
    await expect(findManifestPaths(missing)).rejects.toThrow('at least one workspace');
    const unsupported = await repositoryFixture({ workspaces: ['packages/app'] });
    await expect(findManifestPaths(unsupported)).rejects.toThrow('unsupported workspace pattern');
    const nonString = await repositoryFixture({ workspaces: [42] });
    await expect(findManifestPaths(nonString)).rejects.toThrow('unsupported workspace pattern: 42');
  });
  it('reads and verifies manifest and lockfile versions', async () => {
    const state = await readRepositoryVersions(await repositoryFixture());
    expect(currentRepositoryVersion(state)).toBe('1.2.3');
    expect(assertRepositoryVersion(state, '1.2.3')).toBe('1.2.3');
  });
  it('reports every manifest and lock mismatch', () => {
    const state = {
      manifests: [
        { lockKey: '', name: 'root', path: '/package.json', version: '1.0.0' },
        { lockKey: 'packages/app', name: undefined, path: '/packages/app/package.json', version: '0.9.0' },
      ],
      lockfile: { version: '0.8.0', packages: { '': { version: '1.0.0' } } },
    };
    expect(() => assertRepositoryVersion(state, '1.0.0')).toThrow(
      '/packages/app/package.json is 0.9.0; package-lock.json entry packages/app is undefined; package-lock.json top-level version is 0.8.0',
    );
  });
  it('rejects a root manifest with no version', () => {
    expect(() => currentRepositoryVersion({ manifests: [{ version: undefined }], lockfile: {} })).toThrow(
      'root package.json has no version',
    );
  });
});

describe('changelog notes', () => {
  it('extracts one exact section through the next release and normalizes CRLF', () => {
    const changelog = [
      '# 1.2.30 (2026-09-16)', '', '- Later.', '', '# 1.2.3 (2026-09-15)', '',
      '## Features', '', '- Exact release.', '', '# 1.2.2 (2026-09-14)', '', '- Earlier.',
    ].join('\r\n');
    expect(extractReleaseNotes(changelog, '1.2.3')).toBe('## Features\n\n- Exact release.\n');
  });
  it('extracts the final section at end of file', () => {
    expect(extractReleaseNotes('# 1.2.3 (2026-09-15)\n\n- Final.\n', '1.2.3')).toBe('- Final.\n');
  });
  it('rejects absent, duplicate, empty, and unfinished entries', () => {
    expect(() => extractReleaseNotes('# 1.2.30 (2026-09-15)\n\n- Other.\n', '1.2.3')).toThrow('exactly one release heading');
    expect(() => extractReleaseNotes('# 1.2.3 (2026-09-15)\n\n- One.\n\n# 1.2.3 (2026-09-16)\n\n- Two.\n', '1.2.3')).toThrow('exactly one release heading');
    expect(() => extractReleaseNotes('# 1.2.3 (2026-09-15)\n\n<!-- only a comment -->\n', '1.2.3')).toThrow('has no release notes');
    expect(() => extractReleaseNotes('# 1.2.3 (2026-09-15)\n\n<!-- TODO: highlights -->\n- Detail.\n', '1.2.3')).toThrow('contains a TODO marker');
  });
});

describe('command interface', () => {
  it('resolves, verifies, and writes notes', async () => {
    const root = await repositoryFixture();
    const output = vi.fn();
    await main(['resolve', 'minor', ''], { repositoryRoot: root, output });
    await main(['verify', '1.2.3'], { repositoryRoot: root, output });
    const notesPath = path.join(root, 'notes.md');
    await main(['notes', '1.2.3', notesPath], { repositoryRoot: root, output });
    expect(output.mock.calls).toEqual([['1.3.0\n'], ['repository versions are 1.2.3\n']]);
    expect(await readFile(notesPath, 'utf8')).toBe('## Features\n\n- Shipped.\n');
  });
  it('rejects missing or extra command arguments and unknown commands', async () => {
    const root = await repositoryFixture();
    await expect(main(['resolve', 'patch'], { repositoryRoot: root })).rejects.toThrow('release.mjs resolve');
    await expect(main(['verify', '1.2.3', 'extra'], { repositoryRoot: root })).rejects.toThrow('release.mjs verify');
    await expect(main(['notes', '1.2.3'], { repositoryRoot: root })).rejects.toThrow('release.mjs notes');
    await expect(main(['unknown'], { repositoryRoot: root })).rejects.toThrow('release.mjs <resolve|verify|notes>');
  });
  it('covers direct CLI success, failure, and a missing argv path', async () => {
    const originalArgv = process.argv;
    const originalCwd = process.cwd();
    const originalExitCode = process.exitCode;
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const root = await repositoryFixture();
    const modulePath = fileURLToPath(new URL('./release.mjs', import.meta.url));
    try {
      process.chdir(root);
      process.argv = ['node', modulePath, 'verify', '1.2.3'];
      await import(/* @vite-ignore */ `${pathToFileURL(modulePath).href}?success=${Date.now()}`);
      expect(stdout).toHaveBeenCalledWith('repository versions are 1.2.3\n');
      process.argv = ['node', modulePath, 'verify', '9.9.9'];
      await import(/* @vite-ignore */ `${pathToFileURL(modulePath).href}?failure=${Date.now()}`);
      expect(stderr).toHaveBeenCalledWith(expect.stringContaining('release: repository versions'));
      expect(process.exitCode).toBe(1);
      process.argv = ['node'];
      await import(/* @vite-ignore */ `${pathToFileURL(modulePath).href}?noargv=${Date.now()}`);
    } finally {
      process.argv = originalArgv;
      process.chdir(originalCwd);
      process.exitCode = originalExitCode;
    }
  });
});
