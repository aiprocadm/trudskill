import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { name: '@cdoprof/worker', include: ['src/**/*.test.ts'] }
});
