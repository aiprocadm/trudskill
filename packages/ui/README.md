# @trudskill/ui

Базовый UI-kit/design foundation для frontend-приложений.

## Состав

- Tokens: spacing/radius/typography/z-index/semantic status.
- Primitives: `PageContainer`, `Section`, `Stack`, `Inline`, `Card`.
- Components: table, filters, forms, badges/chips, dialogs, pagination, search, lookup select, date range, async status, permission wrapper.
- Patterns: `RegistryToolbar`, `RegistryFilterBar`, table state handling (empty/loading/error/forbidden).

## Conventions

- Статусы и role-aware сценарии строятся на `@trudskill/shared-types`.
- Компоненты UI-kit не должны содержать доменную бизнес-логику.
- Новые компоненты должны иметь example/demo в соответствующем frontend приложении.

## Как расширять

1. Добавить компонент в `src/components/*` или `src/patterns/*`.
2. Экспортировать через `src/index.tsx`.
3. Проверить `pnpm --filter @trudskill/ui typecheck && pnpm --filter @trudskill/ui test`.
