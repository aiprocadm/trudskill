import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { name: '@cdoprof/ui', include: ['src/**/*.test.tsx'] }
});
