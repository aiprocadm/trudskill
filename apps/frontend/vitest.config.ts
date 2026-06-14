import path from 'node:path';

import { config as loadDotenv } from 'dotenv';
import { defineConfig } from 'vitest/config';

loadDotenv({ path: path.resolve(__dirname, '../../.env') });

export default defineConfig({
  resolve: {
    alias: {
      '@cdoprof/api-contracts': path.resolve(
        __dirname,
        '../../packages/api-contracts/src/index.ts'
      ),
      '@cdoprof/shared-types': path.resolve(__dirname, '../../packages/shared-types/src/index.ts'),
      '@cdoprof/ui': path.resolve(__dirname, '../../packages/ui/src/index.tsx'),
      '@tanstack/react-query': path.resolve(__dirname, './src/lib/query/react-query-shim.tsx')
    }
  },
  test: {
    name: '@cdoprof/frontend',
    include: ['app/**/*.test.tsx', 'src/**/*.test.ts'],
    setupFiles: ['./vitest.setup-env.ts'],
    // Module-smoke tests in src/e2e/* assert structure via `await import(...)`. The first
    // cold dynamic import of a heavy feature module pays a one-off transform cost (~2s in
    // isolation) that can exceed vitest's default 5000ms when many parallel workers thrash
    // transforms on slower machines. The assertions are structural, not temporal, so give
    // them ample headroom rather than flaking under load (CI stays green either way).
    testTimeout: 30000,
    hookTimeout: 30000
  }
});
