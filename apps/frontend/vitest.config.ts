import { defineConfig } from 'vitest/config';
import path from 'node:path';
import { config as loadDotenv } from 'dotenv';

loadDotenv({ path: path.resolve(__dirname, '../../.env') });

export default defineConfig({
	resolve: {
		alias: {
			'@cdoprof/api-contracts': path.resolve(__dirname, '../../packages/api-contracts/src/index.ts'),
			'@cdoprof/ui': path.resolve(__dirname, '../../packages/ui/src/index.tsx')
		}
	},
	test: { include: ['app/**/*.test.tsx', 'src/**/*.test.ts'] }
});
