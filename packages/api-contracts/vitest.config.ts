import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { name: '@cdoprof/api-contracts', include: ['src/**/*.test.ts'] }
});
