# Фаза 2 ТЗ редизайна · Эталонный реестр и карточка — план

> **Для агентов:** исполнять последовательно (`superpowers:executing-plans`) — задачи 1–6 наращивают один пакет `@trudskill/ui`, задача 7 их применяет. Шаги — чекбоксы `- [ ]`.

**Цель:** `/learners` и `/learners/[id]` становятся образцом, по которому переделываются остальные 30 экранов: выделение строк, массовые действия, настройка колонок, свёрнутые фильтры, панель деталей без ухода со списка, осмысленное пустое состояние.

**Архитектура:** всё новое — в пакете `@trudskill/ui` (правило `CLAUDE.md`: компонент берётся из пакета, а не пишется в экране). Дополнения к `DataTable` и `FilterBar` **обратно совместимы** — иначе 30 экранов, которые их уже используют, сломаются разом. `DetailDrawer` не пишется с нуля: он обобщает пять существующих дроверов и три модалки того же назначения.

**Стек:** React 19, TypeScript, vitest без RTL (логика — в чистых функциях, они и тестируются), токены `--ui-*`, `uiGlobalStyles`.

## Глобальные ограничения

- **Обратная совместимость `DataTable`/`FilterBar` обязательна:** все новые свойства опциональны, поведение без них не меняется.
- **Карточный режим на телефоне не ломать** (`data-label`, сторож `data-label.test.tsx`), тач-зоны ≥44px (`touch-targets`).
- **Никакого `<style jsx>`** — сторож `styled-jsx-ban` из Фазы 1 это стережёт; CSS только в `packages/ui/src/styles/*`.
- **Только токены**, никакого хардкода цветов и радиусов (`token-discipline`).
- URL, контракты `packages/api-contracts` и RBAC не трогаются.
- Бюджеты плотности: ≤3 видимых фильтра, ≤7 колонок по умолчанию, 1 первичное действие в шапке.
- Тексты: «вы» со строчной, без англицизмов, «Нет данных» запрещено (`TXT-005`).
- Фаза = один PR ≤30 файлов; заканчивается зелёным `ci:check` + обновлением трекера, handoff и README.

## Карта файлов

| Файл                                                                  | Действие                                                                |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `packages/ui/src/components/table/index.tsx`                          | Изменить: выделение, действия строки, плотность, настройка колонок      |
| `packages/ui/src/components/table/selection.ts`                       | Создать: чистая логика выделения (выбрать всё / частично / переключить) |
| `packages/ui/src/components/table/selection.test.ts`                  | Создать                                                                 |
| `packages/ui/src/components/table/column-config.ts`                   | Создать: чистая логика видимых колонок                                  |
| `packages/ui/src/components/table/column-config.test.ts`              | Создать                                                                 |
| `packages/ui/src/components/filters/index.tsx`                        | Изменить: `primary`/`secondary`/«Ещё фильтры»/счётчик                   |
| `packages/ui/src/components/filters/filters.test.tsx`                 | Создать                                                                 |
| `packages/ui/src/components/states/index.tsx`                         | Изменить: `EmptyState.action`                                           |
| `packages/ui/src/components/bulk-action-bar/index.tsx`                | Создать: `BulkActionBar`                                                |
| `packages/ui/src/components/bulk-action-bar/bulk-action-bar.test.tsx` | Создать                                                                 |
| `packages/ui/src/components/detail-drawer/index.tsx`                  | Создать: `DetailDrawer`                                                 |
| `packages/ui/src/components/detail-drawer/detail-drawer.test.tsx`     | Создать                                                                 |
| `packages/ui/src/styles/tables.ts`, `styles/layout.ts`                | Изменить: стили выделения, панели действий, дровера                     |
| `packages/ui/src/index.ts`                                            | Изменить: экспорт нового                                                |
| `apps/frontend/src/features/learners/learners-list-screen.tsx`        | Изменить: применение всего перечисленного                               |
| `apps/frontend/src/features/learners/learner-edit-drawer.tsx`         | Изменить: переезд на `DetailDrawer`                                     |
| `apps/frontend/src/e2e/unified-states.e2e.test.ts`                    | Изменить: расширение охвата (`IA-001`)                                  |
| `docs/TZ_UI_REDESIGN_STATUS.md`, `README.md`, `LMS_AGENT_HANDOFF.md`  | Изменить: статусы, журнал, handoff                                      |

---

### Task 1: Выделение строк и действия строки (`CMP-001`)

**Файлы:** `packages/ui/src/components/table/{index.tsx,selection.ts,selection.test.ts}`

**Интерфейсы:**

- Отдаёт: `toggleKey(selected, key)`, `toggleAll(selected, allKeys)`, `selectionState(selected, allKeys): 'none' | 'some' | 'all'` — чистые функции; `DataTable` получает опциональные `selectable`, `selectedKeys`, `onSelectionChange`, `rowActions`, `density`.

- [ ] **Шаг 1: тест логики выделения** — `toggleKey` добавляет и убирает; `toggleAll` при частичном выделении выделяет всё, при полном — снимает; `selectionState` различает три состояния; пустой список даёт `'none'`, а не `'all'` (иначе шапка покажет «выделено всё» на пустой таблице).
- [ ] **Шаг 2:** прогнать — падает (модуля нет).
- [ ] **Шаг 3:** реализовать `selection.ts`.
- [ ] **Шаг 4:** прогнать — зелено.
- [ ] **Шаг 5:** подключить в `DataTable`: колонка чекбоксов первой, колонка действий последней, `density` меняет класс. Все свойства опциональны; без `selectable` разметка прежняя (проверить сторожем `data-label`).
- [ ] **Шаг 6:** `pnpm --filter @trudskill/ui exec vitest run src` — зелено, включая `data-label` и `touch-targets`.
- [ ] **Шаг 7:** коммит.

### Task 2: Настройка колонок (`CMP-002`)

**Файлы:** `packages/ui/src/components/table/{column-config.ts,column-config.test.ts,index.tsx}`

- [ ] **Шаг 1: тест** — первая колонка не скрывается никогда; `resetColumns` возвращает исходный набор; неизвестный ключ игнорируется; пустой `visibleKeys` = показать все (защита от «пустой таблицы» после кривого сохранения).
- [ ] **Шаг 2:** прогнать — падает.
- [ ] **Шаг 3:** реализовать `column-config.ts` + свойство `columnConfig` у `DataTable` (кнопка «Колонки» → список чекбоксов → «Сбросить»).
- [ ] **Шаг 4:** прогнать — зелено. **Шаг 5:** коммит.

### Task 3: Свёрнутые фильтры (`CMP-003`)

**Файлы:** `packages/ui/src/components/filters/{index.tsx,filters.test.tsx}`

- [ ] **Шаг 1: тест** — при `secondary` рендерится кнопка «Ещё фильтры»; `activeCount > 0` показывает счётчик; `onReset` рисует «Сбросить»; старое использование (`children`) продолжает работать.
- [ ] **Шаг 2:** прогнать — падает. **Шаг 3:** реализовать. **Шаг 4:** зелено. **Шаг 5:** коммит.

### Task 4: Пустое состояние с действием (`CMP-014`)

**Файлы:** `packages/ui/src/components/states/index.tsx`

- [ ] **Шаг 1: тест** — `action.href` даёт ссылку, `action.onSelect` — кнопку; без `action` разметка прежняя.
- [ ] **Шаг 2–4:** реализовать, прогнать, коммит.

### Task 5: Панель массовых действий (`CMP-011`)

**Файлы:** `packages/ui/src/components/bulk-action-bar/{index.tsx,bulk-action-bar.test.tsx}`

- [ ] **Шаг 1: тест** — при `selectedCount = 0` не рендерится; показывает «Выделено: N»; `danger` помечает действие; состояние «выполняется» блокирует повторное нажатие; **частичный успех выводится поимённо** (обязательное состояние по ТЗ).
- [ ] **Шаг 2–5:** реализовать, прогнать, стили, коммит.

### Task 6: Панель деталей (`CMP-010`)

**Файлы:** `packages/ui/src/components/detail-drawer/{index.tsx,detail-drawer.test.tsx}`

- [ ] **Шаг 1: тест** — закрыт при `open=false`; `Esc` вызывает `onClose`; при `isLoading` показывает скелет, при `error` — ошибку с «Повторить»; при несохранённых изменениях закрытие требует подтверждения.
- [ ] **Шаг 2–5:** реализовать (ловушка фокуса, `aria-modal`, возврат фокуса), стили (ширины `sm/md/lg`, на ≤480px во весь экран), прогнать, коммит.

### Task 7: Применение на реестре слушателей

**Файлы:** `apps/frontend/src/features/learners/{learners-list-screen.tsx,learner-edit-drawer.tsx}`

- [ ] **Шаг 1:** колонки → ≤7 с настройкой (сейчас 7 включая пустую колонку действий — она уезжает в `rowActions`).
- [ ] **Шаг 2:** фильтры → `primary` (поиск, статус) + `secondary`; выделение строк + `BulkActionBar` с действием «Архивировать выбранных» через существующую ручку, частичный успех поимённо.
- [ ] **Шаг 3:** `learner-edit-drawer` переезжает на `DetailDrawer` (своя разметка удаляется, поведение сохраняется).
- [ ] **Шаг 4:** пустое состояние получает действие «Добавить слушателя».
- [ ] **Шаг 5:** `pnpm --filter @trudskill/frontend exec vitest run` — зелено. **Шаг 6:** коммит.

### Task 8: Расширение сторожа единых состояний (`IA-001`)

**Файлы:** `apps/frontend/src/e2e/unified-states.e2e.test.ts`

- [ ] **Шаг 1:** расширить охват на `app/**` и все `.tsx` в `features/` (сейчас только `src/features` и только файлы со словом `screen`).
- [ ] **Шаг 2:** прогнать — увидеть список нарушителей (ожидается ~9).
- [ ] **Шаг 3:** починить нарушителей или, если их больше, чем помещается в бюджет фазы, — внести оставшихся в явный список исключений **с записью в журнал расхождений** (молчаливое сужение запрещено).
- [ ] **Шаг 4:** зелено. **Шаг 5:** коммит.

### Task 9: Замер списка до и после (`MET-003`)

- [ ] **Шаг 1:** снять p95 `GET /learners` на живом стенде до изменений (10 прогонов), записать.
- [ ] **Шаг 2:** снять после, сравнить, записать в трекер. Ухудшение — повод разбираться, а не строчка в отчёте.

### Task 10: Документы фазы

- [ ] Трекер: статусы `CMP-*`, `IA-001`, `MET-003`, журнал расхождений, журнал сессий.
- [ ] `LMS_AGENT_HANDOFF.md` §5.261, `README.md` §2.
- [ ] `pnpm ci:check` — exit 0 (судить по коду выхода, не по последней строке).

## Самопроверка плана

Покрытие: `CMP-001` → Task 1, `CMP-002` → 2, `CMP-003` → 3, `CMP-014` → 4, `CMP-011` → 5, `CMP-010` → 6, применение → 7, `IA-001` → 8, `MET-003` → 9.
Вне фазы намеренно: `CMP-012` (сохранённые представления) и `CMP-013` (`AttentionWidget`) — они в Фазах 3–4 по дорожной карте; `CMP-006` (замена `window.confirm`) — Фаза 4.
