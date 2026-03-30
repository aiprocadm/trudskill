import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
	resolve: {
		alias: {
			'@cdoprof/api-contracts': path.resolve(__dirname, '../../packages/api-contracts/src/index.ts')
		}
	},
	test: { include: ['src/**/*.test.ts'] }
});
