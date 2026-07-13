import path from 'node:path';

import { config as loadDotenv } from 'dotenv';
import { defineConfig } from 'vitest/config';

loadDotenv({ path: path.resolve(__dirname, '../../.env') });

export default defineConfig({
  // Компоненты фронта написаны под автоматический JSX-рантайм (Next.js, без `import React`).
  // esbuild в vitest по умолчанию берёт классический `React.createElement`, из-за чего вызов
  // любого JSX-компонента как функции падает с «React is not defined». Ставим automatic, чтобы
  // тесты-как-функция (напр. SectionCard) совпадали с продакшн-трансформом. Совпадает с packages/ui.
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: {
      '@trudskill/api-contracts': path.resolve(
        __dirname,
        '../../packages/api-contracts/src/index.ts'
      ),
      '@trudskill/shared-types': path.resolve(
        __dirname,
        '../../packages/shared-types/src/index.ts'
      ),
      '@trudskill/ui': path.resolve(__dirname, '../../packages/ui/src/index.tsx'),
      '@tanstack/react-query': path.resolve(__dirname, './src/lib/query/react-query-shim.tsx')
    }
  },
  test: {
    name: '@trudskill/frontend',
    include: ['app/**/*.test.tsx', 'src/**/*.test.ts'],
    setupFiles: ['./vitest.setup-env.ts'],
    // Module-smoke tests in src/e2e/* assert structure via `await import(...)`. The first
    // cold dynamic import of a heavy feature module pays a one-off transform cost (~2s in
    // isolation) that can exceed vitest's default 5000ms when many parallel workers thrash
    // transforms on slower machines. The assertions are structural, not temporal, so give
    // them ample headroom rather than flaking under load (CI stays green either way).
    // 60s (raised from 30s): on the Cyrillic-path Windows dev box the full parallel suite
    // pushes a cold `await import()` past 30s under transform contention (isolated it is ~10s).
    // A genuinely broken import throws rather than hangs, so the larger ceiling guards only
    // against a true hang and does not mask real failures.
    testTimeout: 60000,
    hookTimeout: 60000
  }
});
