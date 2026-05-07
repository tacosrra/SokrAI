import path from 'node:path';
import { defineConfig } from 'vitest/config';

const repoRoot = path.resolve(__dirname, '../..');

export default defineConfig({
  envDir: repoRoot,
  test: {
    setupFiles: [path.join(repoRoot, 'tests', 'vitest-load-env.ts')],
    environment: 'node',
    globals: true,
    include: ['../../tests/**/*.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
    sequence: {
      concurrent: false,
    },
  },
});
