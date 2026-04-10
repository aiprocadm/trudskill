# NestJS и импорты для DI

В файлах с декораторами Nest (`*.module.ts`, `*.controller.ts`, `*.service.ts`, guards, interceptors) правило `@typescript-eslint/consistent-type-imports` **отключено** в корневом `eslint.config.mjs`: классы провайдеров должны попадать в бандл как **value** (для `emitDecoratorMetadata` и явного `@Inject(Klass)`).

В остальном коде по-прежнему действует `consistent-type-imports`.

Рекомендация: для инжектируемых классов использовать обычный импорт или `@Inject(Token)` с токеном/классом в value-позиции.
