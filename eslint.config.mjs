import nextPlugin from '@next/eslint-plugin-next';
import tseslint from '@typescript-eslint/eslint-plugin';
import parser from '@typescript-eslint/parser';
import prettier from 'eslint-config-prettier';
import eslintPluginImport from 'eslint-plugin-import';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import globals from 'globals';

export default [
  {
    ignores: ['**/dist/**', '**/.next/**', '**/node_modules/**', '**/coverage/**', '**/*.d.ts']
  },
  {
    files: ['**/*.{ts,tsx,js,jsx,mjs,cjs}'],
    languageOptions: {
      parser,
      parserOptions: {
        tsconfigRootDir: import.meta.dirname
      }
    },
    plugins: {
      '@typescript-eslint': tseslint,
      import: eslintPluginImport
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' }
      ],
      'sort-imports': ['error', { ignoreDeclarationSort: true }],
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index'], 'type'],
          alphabetize: { order: 'asc', caseInsensitive: true },
          'newlines-between': 'always'
        }
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['apps/*', './apps/*', '../apps/*', '../../apps/*', 'packages/*/src/*'],
              message:
                'Import only through package entrypoints (workspace package names), not via app/package source paths.'
            }
          ]
        }
      ]
    }
  },
  {
    files: ['apps/frontend/**/*.{ts,tsx,js,jsx}'],
    plugins: {
      '@next/next': nextPlugin
    },
    rules: {
      '@next/next/no-img-element': 'warn',
      // Иконки только через <Icon icon={...} /> из @trudskill/ui.
      // no-restricted-imports НЕ мёржится между блоками — дублируем глобальный patterns.
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'lucide-react',
              message:
                'Не импортируйте иконки напрямую из lucide-react. Используйте <Icon icon={...} /> из @trudskill/ui (глифы — из features/navigation/nav-icons).',
              allowTypeImports: true
            }
          ],
          patterns: [
            {
              group: ['apps/*', './apps/*', '../apps/*', '../../apps/*', 'packages/*/src/*'],
              message:
                'Import only through package entrypoints (workspace package names), not via app/package source paths.'
            },
            {
              group: ['lucide-react/*'],
              message:
                'Не импортируйте иконки напрямую из lucide-react. Используйте <Icon icon={...} /> из @trudskill/ui.'
            }
          ]
        }
      ]
    }
  },
  {
    // Единственное исключение: курируемый реестр иконок навигации.
    // Здесь lucide-react разрешён; глобальная гигиена импортов сохранена.
    files: ['apps/frontend/src/features/navigation/nav-icons.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['apps/*', './apps/*', '../apps/*', '../../apps/*', 'packages/*/src/*'],
              message:
                'Import only through package entrypoints (workspace package names), not via app/package source paths.'
            }
          ]
        }
      ]
    }
  },
  {
    files: ['apps/{backend,worker,realtime}/**/*.{ts,tsx,js,jsx,mjs,cjs}', 'scripts/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  },
  {
    files: [
      'apps/backend/src/**/*.module.ts',
      'apps/backend/src/**/*.controller.ts',
      'apps/backend/src/**/*guard*.ts',
      'apps/backend/src/**/*interceptor*.ts',
      'apps/backend/src/**/*.service.ts'
    ],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off'
    }
  },
  {
    // Phase 10 Track B — статический WCAG-гейт для общих примитивов и экранов.
    // Покрывает и packages/ui, и apps/frontend (оба резолвят этот корневой flat-config).
    files: ['apps/frontend/**/*.{jsx,tsx}', 'packages/ui/**/*.{jsx,tsx}'],
    ...jsxA11y.flatConfigs.recommended
  },
  {
    files: ['**/*.test.{ts,tsx,js,jsx}', '**/vitest.config.ts'],
    languageOptions: {
      globals: {
        ...globals.node
      }
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off'
    }
  },
  prettier
];
