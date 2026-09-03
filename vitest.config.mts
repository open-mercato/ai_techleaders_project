import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'packages/**/*.test.ts',
      'packages/**/*.test.tsx',
      // The `npm run setup` installer lives outside packages/; without this its tests
      // would never be collected and its coverage gate would pass vacuously.
      'scripts/**/*.test.mjs',
    ],
    exclude: [
      'tests/integration/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/dist/**',
    ],
    coverage: {
      provider: 'v8',
      include: [
        'packages/core/src/http/makeCrudRoute.ts',
        'packages/db/src/config.ts',
        'packages/db/src/seeders/database.seeder.ts',
        'scripts/setup/effects.mjs',
        'scripts/setup/index.mjs',
        'scripts/setup/run.mjs',
        'scripts/setup/steps.mjs',
      ],
      reportsDirectory: 'coverage/unit',
      reporter: ['text', 'json', 'html', 'lcov'],
      thresholds: {
        perFile: true,
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
});
