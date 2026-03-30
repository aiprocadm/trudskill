import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
	resolve: {
		alias: {
			'@cdoprof/shared-types': path.resolve(__dirname, '../shared-types/src/index.ts')
		}
	},
	test: { include: ['src/**/*.test.ts'] }
});
