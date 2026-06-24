import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { name: '@trudskill/ui', include: ['src/**/*.test.tsx'] }
});
