import path from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@trudskill/shared-types': path.resolve(__dirname, '../shared-types/src/index.ts')
    }
  },
  test: { name: '@trudskill/test-utils', include: ['src/**/*.test.ts'] }
});
