# @cdoprof/ui

Базовый UI-kit/design foundation для frontend-приложений.

## Состав

- Tokens: spacing/radius/typography/z-index/semantic status.
- Primitives: `PageContainer`, `Section`, `Stack`, `Inline`, `Card`.
- Components: table, filter bar, form field, status chip, dialogs, pagination, search, lookup select, date range, async status, permission wrapper.
- Patterns: registry toolbar и state handling (empty/loading/error/forbidden).

## Conventions

- Статусы берутся из `@cdoprof/shared-types`.
- Бизнес-логика модулей сюда не добавляется.
- Новые компоненты должны иметь пример использования в docs/stories соответствующего app.
