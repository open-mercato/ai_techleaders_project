import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: [
    { find: '@devmentor/ui/backend', replacement: fileURLToPath(new URL('../../packages/ui/src/backend/index.ts', import.meta.url)) },
    { find: '@devmentor/ui', replacement: fileURLToPath(new URL('../../packages/ui/src/index.ts', import.meta.url)) },
  ] },
  test: { environment: 'jsdom', include: ['prototypes/devmentor-journey/*.test.tsx'] },
});
