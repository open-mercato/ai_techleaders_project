import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { alias: [
    { find: '@devmentor/ui/backend', replacement: fileURLToPath(new URL('../../packages/ui/src/backend/index.ts', import.meta.url)) },
    { find: '@devmentor/ui', replacement: fileURLToPath(new URL('../../packages/ui/src/index.ts', import.meta.url)) },
  ] },
  test: {
    environment: 'jsdom', include: ['prototypes/devmentor-journey/*.test.tsx'],
    coverage: {
      provider: 'v8', enabled: true, reportsDirectory: 'coverage/prototype',
      include: ['prototypes/devmentor-journey/auth-model.ts', 'prototypes/devmentor-journey/auth-runtime.ts', 'prototypes/devmentor-journey/mentor-model.ts', 'prototypes/devmentor-journey/mentor-runtime.ts', 'prototypes/devmentor-journey/session-view-model.ts', 'prototypes/devmentor-journey/mentors.ts'],
      thresholds: { perFile: true, statements: 100, branches: 100, functions: 100, lines: 100 },
    },
  },
});
