import { createNodeEffects } from './effects.mjs';
import { runSetup } from './run.mjs';

// Entry point for `npm run setup`. Composition only — no branches, no logic. Setting
// `process.exitCode` rather than calling `process.exit()` lets stdout flush first.
process.exitCode = await runSetup(createNodeEffects());
