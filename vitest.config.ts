import { defineConfig } from 'vitest/config';

/** Единый вход для `pnpm exec vitest` из корня: `test.projects` вместо устаревшего workspace-файла. */
export default defineConfig({
  test: {
    projects: [
      'apps/backend/vitest.config.ts',
      'apps/frontend/vitest.config.ts',
      'apps/worker/vitest.config.ts',
      'apps/realtime/vitest.config.ts',
      'packages/api-contracts/vitest.config.ts',
      'packages/ui/vitest.config.ts',
      'packages/shared-types/vitest.config.ts',
      'packages/test-utils/vitest.config.ts'
    ]
  }
});
