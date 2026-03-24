import { fileURLToPath, URL } from 'node:url';

import { defineConfig } from 'vitest/config';

const rootReact = fileURLToPath(new URL('../../node_modules/react/index.js', import.meta.url));
const rootJsxRuntime = fileURLToPath(
  new URL('../../node_modules/react/jsx-runtime.js', import.meta.url)
);
const rootJsxDevRuntime = fileURLToPath(
  new URL('../../node_modules/react/jsx-dev-runtime.js', import.meta.url)
);

export default defineConfig({
  resolve: {
    alias: {
      '@cdoprof/shared-types': fileURLToPath(
        new URL('../shared-types/src/index.ts', import.meta.url)
      ),
      react: rootReact,
      'react/jsx-runtime': rootJsxRuntime,
      'react/jsx-dev-runtime': rootJsxDevRuntime
    }
  },
  test: { include: ['src/**/*.test.tsx'] }
});
