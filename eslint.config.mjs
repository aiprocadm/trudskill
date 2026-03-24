import tseslint from '@typescript-eslint/eslint-plugin';
import parser from '@typescript-eslint/parser';
import nextPlugin from 'eslint-config-next';
import prettier from 'eslint-config-prettier';

export default [
  {
    ignores: ['**/dist/**', '**/.next/**', '**/node_modules/**', '**/coverage/**']
  },
  {
    files: ['**/*.{ts,tsx,js,jsx,mjs,cjs}'],
    languageOptions: {
      parser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    plugins: {
      '@typescript-eslint': tseslint
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { 'argsIgnorePattern': '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
      'sort-imports': ['error', { 'ignoreDeclarationSort': true }]
    }
  },
  ...nextPlugin,
  prettier
];
