import nextPlugin from '@next/eslint-plugin-next';
import tseslint from '@typescript-eslint/eslint-plugin';
import parser from '@typescript-eslint/parser';
import prettier from 'eslint-config-prettier';
// eslint-plugin-import поддерживает ESLint максимум 9-й: на 10-м он падает
// `sourceCode.getTokenOrCommentBefore is not a function` — причём ТОЛЬКО когда
// правилу нужно ИСПРАВИТЬ порядок импортов, поэтому поломка всплывает не сразу.
// import-x — поддерживаемый форк с заявленной поддержкой ESLint 10.
import eslintPluginImport from 'eslint-plugin-import-x';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default [
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/coverage/**',
      '**/*.d.ts',
      // Служебный воркер PWA генерируется serwist при сборке (он в .gitignore).
      // `next lint` его не видел, а `eslint .` — видит, и линтовать сгенерированный
      // минифицированный файл бессмысленно.
      '**/public/sw.js',
      '**/public/swe-worker-*.js',
      '**/public/workbox-*.js'
    ]
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
      'import-x': eslintPluginImport
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' }
      ],
      'sort-imports': ['error', { ignoreDeclarationSort: true }],
      'import-x/order': [
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
      '@next/next': nextPlugin,
      'react-hooks': reactHooksPlugin
    },
    rules: {
      // Правила Next.js перенесены сюда из apps/frontend/.eslintrc.json вместе с уходом
      // от `next lint` (он удалён в Next 16 и несовместим с ESLint 10). Раскрываем весь
      // набор `core-web-vitals`, иначе переезд молча потерял бы 20 из 21 правила.
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
      /*
       * Порядок хуков (ТЗ 10.3, журнал 592). Правило числилось в наборе `core-web-vitals`, но
       * сам плагин подключён не был — ESLint молча пропускал его («Definition for rule … was
       * not found» видно только при явном отключении правила в коде). Слепая зона стоила
       * падения экрана сдачи практической работы: `useState` стоял после раннего возврата, и
       * в переходе «грузится → загрузилось» число хуков менялось.
       *
       * Правило класса «приложение падает», поэтому `error`, а не предупреждение.
       */
      'react-hooks/rules-of-hooks': 'error',
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
  {
    /*
     * Тесты подмены react-query зовут `useQuery` внутри вспомогательной `render()` — это и есть
     * предмет проверки: сколько раз подмена дёрнет запрос за отрисовку. Правило порядка хуков
     * здесь говорит о настоящем устройстве кода верно, но требование «только в компоненте»
     * относится к экранам, а не к стенду, который компонент изображает.
     *
     * Исключение точечное, по двум файлам: правило остаётся `error` для всего остального.
     */
    files: [
      'apps/frontend/src/lib/query/react-query-shim.loop-guard.test.ts',
      'apps/frontend/src/lib/query/react-query-shim.retry-ceiling.test.ts'
    ],
    rules: {
      'react-hooks/rules-of-hooks': 'off'
    }
  },
  prettier
];
