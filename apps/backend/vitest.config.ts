import path from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@trudskill/api-contracts': path.resolve(
        __dirname,
        '../../packages/api-contracts/src/index.ts'
      )
    }
  },
  test: {
    name: '@trudskill/backend',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./vitest.setup-env.ts'],
    hookTimeout: 120000,
    testTimeout: 30000,
    fileParallelism: false
  }
});
