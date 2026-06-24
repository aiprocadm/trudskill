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
  test: { name: '@trudskill/realtime', include: ['src/**/*.test.ts'] }
});
