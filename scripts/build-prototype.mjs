#!/usr/bin/env node
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import tailwindcss from '@tailwindcss/vite';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const prototypeRoot = resolve(repository, 'prototypes/devmentor-journey');

await build({
  configFile: false,
  root: prototypeRoot,
  base: '/prototypes/devmentor-journey/',
  publicDir: false,
  plugins: [tailwindcss()],
  resolve: { dedupe: ['react', 'react-dom'] },
  build: { outDir: resolve(repository, 'packages/ui/.storybook/public/prototypes/devmentor-journey'), emptyOutDir: true },
});

console.log('Prototype: http://127.0.0.1:6006/prototypes/devmentor-journey/index.html');
console.log('Serve with the local Storybook: npm run storybook');
