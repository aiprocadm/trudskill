import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: '@trudskill/shared-types',
    include: ['src/**/*.test.ts']
  }
});
