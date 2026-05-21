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
    setupFiles: ['./vitest.setup-env.ts']
  }
});
