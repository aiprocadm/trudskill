import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@cdoprof/shared-types',
    include: ['src/**/*.test.ts']
  }
});
