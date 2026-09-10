import { createNodeEffects } from './effects.mjs';
import { runStorybook } from './run.mjs';

// Storybook is a long-running process, so preserve its streamed output and surface its
// exit status while letting Node flush the terminal before this wrapper exits.
process.exitCode = await runStorybook(process.argv.slice(2), createNodeEffects());
