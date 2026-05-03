import path from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@cdoprof/api-contracts': path.resolve(__dirname, '../../packages/api-contracts/src/index.ts')
    }
  },
  test: { name: '@cdoprof/realtime', include: ['src/**/*.test.ts'] }
});
