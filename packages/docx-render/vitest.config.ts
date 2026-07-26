import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { name: '@trudskill/docx-render', include: ['src/**/*.test.ts'] }
});
