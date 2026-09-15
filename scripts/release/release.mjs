import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const STABLE_SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const BUMP_KINDS = new Set(['major', 'minor', 'patch']);

export function parseStableVersion(value, label = 'version') {
  const match = STABLE_SEMVER.exec(value);
  if (!match) {
    throw new Error(`${label} must be a stable MAJOR.MINOR.PATCH version without a v prefix`);
  }
  return match.slice(1).map((part) => BigInt(part));
}

export function compareVersions(left, right) {
  const leftParts = parseStableVersion(left, 'left version');
  const rightParts = parseStableVersion(right, 'right version');
  for (let index = 0; index < leftParts.length; index += 1) {
    if (leftParts[index] < rightParts[index]) return -1;
    if (leftParts[index] > rightParts[index]) return 1;
  }
  return 0;
}

export function resolveVersion(current, selection, customVersion = '') {
  const [major, minor, patch] = parseStableVersion(current, 'current package version');
  if (selection === 'custom') {
    const target = customVersion;
    parseStableVersion(target, 'custom version');
    if (compareVersions(target, current) < 0) {
      throw new Error(`custom version ${target} cannot be lower than current version ${current}`);
    }
    return target;
  }
  if (!BUMP_KINDS.has(selection)) {
    throw new Error('version choice must be one of: major, minor, patch, custom');
  }
  if (customVersion !== '') {
    throw new Error('custom version must be empty unless the custom choice is selected');
  }
  if (selection === 'major') return `${major + 1n}.0.0`;
  if (selection === 'minor') return `${major}.${minor + 1n}.0`;
  return `${major}.${minor}.${patch + 1n}`;
}

function workspacePatterns(rootManifest) {
  const configured = rootManifest.workspaces;
  const patterns = Array.isArray(configured) ? configured : configured?.packages;
  if (!Array.isArray(patterns) || patterns.length === 0) {
    throw new Error('root package.json must declare at least one workspace pattern');
  }
  return patterns;
}

export async function findManifestPaths(repositoryRoot) {
  const rootPath = path.join(repositoryRoot, 'package.json');
  const rootManifest = JSON.parse(await readFile(rootPath, 'utf8'));
  const manifests = [{ lockKey: '', path: rootPath }];
  for (const pattern of workspacePatterns(rootManifest)) {
    if (typeof pattern !== 'string' || !pattern.endsWith('/*')) {
      throw new Error(`unsupported workspace pattern: ${String(pattern)}`);
    }
    const parent = pattern.slice(0, -2);
    const entries = await readdir(path.join(repositoryRoot, parent), { withFileTypes: true });
    for (const entry of entries.filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
      const lockKey = path.posix.join(parent.replaceAll(path.sep, '/'), entry.name);
      manifests.push({ lockKey, path: path.join(repositoryRoot, lockKey, 'package.json') });
    }
  }
  return manifests;
}

export async function readRepositoryVersions(repositoryRoot) {
  const manifests = [];
  for (const manifestPath of await findManifestPaths(repositoryRoot)) {
    const manifest = JSON.parse(await readFile(manifestPath.path, 'utf8'));
    manifests.push({ ...manifestPath, name: manifest.name, version: manifest.version });
  }
  const lockfile = JSON.parse(await readFile(path.join(repositoryRoot, 'package-lock.json'), 'utf8'));
  return { lockfile, manifests };
}

export function assertRepositoryVersion(state, expectedVersion) {
  parseStableVersion(expectedVersion, 'expected version');
  const mismatches = [];
  for (const manifest of state.manifests) {
    if (manifest.version !== expectedVersion) {
      mismatches.push(`${manifest.name ?? manifest.path} is ${String(manifest.version)}`);
    }
    const lockedVersion = state.lockfile.packages?.[manifest.lockKey]?.version;
    if (lockedVersion !== expectedVersion) {
      mismatches.push(`package-lock.json entry ${manifest.lockKey || '<root>'} is ${String(lockedVersion)}`);
    }
  }
  if (state.lockfile.version !== expectedVersion) {
    mismatches.push(`package-lock.json top-level version is ${String(state.lockfile.version)}`);
  }
  if (mismatches.length > 0) {
    throw new Error(`repository versions do not all equal ${expectedVersion}: ${mismatches.join('; ')}`);
  }
  return expectedVersion;
}

export function currentRepositoryVersion(state) {
  const current = state.manifests[0]?.version;
  if (typeof current !== 'string') throw new Error('root package.json has no version');
  return assertRepositoryVersion(state, current);
}

export function extractReleaseNotes(changelog, version) {
  parseStableVersion(version);
  const normalized = changelog.replaceAll('\r\n', '\n');
  const escapedVersion = version.replaceAll('.', '\\.');
  const heading = new RegExp(`^# ${escapedVersion} \\(\\d{4}-\\d{2}-\\d{2}\\)$`, 'gm');
  const matches = [...normalized.matchAll(heading)];
  if (matches.length !== 1) {
    throw new Error(`CHANGELOG.md must contain exactly one release heading for ${version}`);
  }
  const bodyStart = matches[0].index + matches[0][0].length;
  const nextHeadingOffset = normalized.slice(bodyStart).search(/^# /m);
  const bodyEnd = nextHeadingOffset === -1 ? normalized.length : bodyStart + nextHeadingOffset;
  const body = normalized.slice(bodyStart, bodyEnd).trim();
  const visibleBody = body.replace(/<!--[\s\S]*?-->/g, '').trim();
  if (visibleBody === '') throw new Error(`CHANGELOG.md release ${version} has no release notes`);
  if (/<!--\s*TODO\b/i.test(body)) {
    throw new Error(`CHANGELOG.md release ${version} still contains a TODO marker`);
  }
  return `${body}\n`;
}

export function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function requireArguments(args, count, usage) {
  if (args.length !== count) throw new Error(`usage: ${usage}`);
}

export async function main(args = process.argv.slice(2), options = {}) {
  const repositoryRoot = options.repositoryRoot ?? process.cwd();
  const output = options.output ?? ((value) => process.stdout.write(value));
  const command = args[0];
  if (command === 'files') {
    requireArguments(args, 1, 'release.mjs files');
    const manifests = await findManifestPaths(repositoryRoot);
    const files = manifests.map(({ lockKey }) => lockKey === '' ? 'package.json' : `${lockKey}/package.json`);
    output(`${[...files, 'package-lock.json'].sort().join('\n')}\n`);
    return;
  }
  if (command === 'resolve') {
    requireArguments(args, 3, 'release.mjs resolve <major|minor|patch|custom> <custom-version-or-empty>');
    const state = await readRepositoryVersions(repositoryRoot);
    const current = currentRepositoryVersion(state);
    output(`${resolveVersion(current, args[1], args[2])}\n`);
    return;
  }
  if (command === 'verify') {
    requireArguments(args, 2, 'release.mjs verify <version>');
    assertRepositoryVersion(await readRepositoryVersions(repositoryRoot), args[1]);
    output(`repository versions are ${args[1]}\n`);
    return;
  }
  if (command === 'notes') {
    requireArguments(args, 3, 'release.mjs notes <version> <output-file>');
    const changelog = await readFile(path.join(repositoryRoot, 'CHANGELOG.md'), 'utf8');
    await writeFile(args[2], extractReleaseNotes(changelog, args[1]), 'utf8');
    return;
  }
  throw new Error('usage: release.mjs <files|resolve|verify|notes> ...');
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(`release: ${errorMessage(error)}\n`);
    process.exitCode = 1;
  }
}
