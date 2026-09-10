import { dirname, join, parse } from 'node:path';

/**
 * Find a Yarn Plug'n'Play manifest visible from a prospective working directory.
 * Storybook and esbuild search all ancestors, even when the actual project uses npm.
 *
 * @param {string} startDirectory
 * @param {(path: string) => Promise<boolean>} fileExists
 * @returns {Promise<string|null>}
 */
export async function findPnpAncestor(startDirectory, fileExists) {
  let directory = startDirectory;

  while (true) {
    for (const name of ['.pnp.cjs', '.pnp.js']) {
      const candidate = join(directory, name);

      if (await fileExists(candidate)) {
        return candidate;
      }
    }

    const parent = dirname(directory);

    if (parent === directory || directory === parse(directory).root) {
      return null;
    }

    directory = parent;
  }
}

/**
 * Start Storybook from an isolated temporary directory. Its config remains the real,
 * absolute UI config, but neither Storybook nor esbuild can mistake a `.pnp.cjs`
 * belonging to a parent directory outside this npm repository for project config.
 *
 * @param {string[]} cliArguments
 * @param {import('./effects.mjs').StorybookEffects} effects
 * @returns {Promise<number>}
 */
export async function runStorybook(cliArguments, effects) {
  const workingDirectory = await effects.prepareWorkingDirectory();
  const pnpManifest = await findPnpAncestor(workingDirectory, effects.fileExists);

  if (pnpManifest !== null) {
    throw new Error(
      `Cannot isolate Storybook from the unrelated Yarn PnP manifest at ${pnpManifest}`,
    );
  }

  const outputArguments = cliArguments[0] === 'build'
    ? ['--output-dir', effects.outputDirectory]
    : [];

  return effects.run(
    effects.nodeExecutable,
    [
      effects.storybookExecutable,
      ...cliArguments,
      ...outputArguments,
      '--config-dir',
      effects.configDirectory,
    ],
    workingDirectory,
  );
}
