import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { name: '@trudskill/worker', include: ['src/**/*.test.ts'] }
});
