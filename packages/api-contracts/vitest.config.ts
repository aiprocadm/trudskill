import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { name: '@trudskill/api-contracts', include: ['src/**/*.test.ts'] }
});
