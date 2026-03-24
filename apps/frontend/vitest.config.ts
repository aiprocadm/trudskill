import { defineConfig } from 'vitest/config';

export default defineConfig({ test: { include: ['app/**/*.test.tsx', 'src/**/*.test.ts'] } });
