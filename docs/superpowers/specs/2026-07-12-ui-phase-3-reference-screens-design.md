# UI redesign — Фаза 3: эталонные шаблоны экранов (reference template screens)

- **Дата:** 2026-07-12
- **Статус:** дизайн согласован (brainstorming), готов к плану
- **Ветка:** `feat/2026-07-12-ui-phase-3-reference-screens`
- **Предшественники:** Фаза 1 (дизайн-система, PR #299, §5.162), Фаза 2 (навигация/оболочка, PR #301, §5.163) — обе слиты в `main`.
- **Автор карты состояния:** фоновый workflow `phase3-screen-landscape-map` (93 экрана размечены по архетипам).

---

## 1. Контекст и цель

Редизайн фронтенда идёт по фазам: `0 аудит → 1 дизайн-система → 2 навигация → 3 эталонные шаблоны → 4 миграция страниц → 5 слияние дублей → 6 тёмная тема/адаптив/a11y`.

**Проблема, которую решает Фаза 3.** Композиционный слой в `packages/ui` фактически пуст. Примитивы существуют, но простаивают, а экраны собираются вручную и разъезжаются:

- **158** «сырых» `<input>` вместо `FormField`; **3** разных разметки «поле формы»;
- **3** разных разметки «ключ–значение» (вместо `KeyValueList`);
- **3** разных отрисовки KPI-плиток (вместо `StatCard`);
- цепочка состояний (загрузка/ошибка/пусто) скопирована вручную и дрейфует (в `analytics` даже подделан `<SectionCard title="Загрузка">` вместо `LoadingState`);
- **107** инлайновых `style={{}}` в 23 файлах;
- удаление через `window.confirm` в 5+ файлах вместо `ConfirmDialog`;
- контракт хука данных расщеплён: React-Query `{ data: { items, total }, isLoading, refetch }` против самописного `{ data, loading, error }`.

**Цель Фазы 3.** Дать **эталонные каркасы** для 4 архетипов экранов, чтобы миграция в Фазе 4 стала механической заменой, а не ручной вёрсткой каждого экрана. Принцип — **«упаковка, а не переписывание»**: визуальный язык задан Фазой 1 (токены `--ui-*`, индиго `#3b4fe4` + коралл `#ff7a45`, Inter); новые компоненты кладутся поверх уже готового CSS в `packages/ui/src/styles/foundation.ts` и `layout.ts`. Почти без нового CSS.

## 2. Форма поставки (согласовано)

Три составляющие (решение владельца):

1. **Компоненты-каркасы** в `@trudskill/ui` (переиспользуемые, со «слотами»).
2. **Живая витрина** — маршрут `/admin/ui-kit`, где все каркасы показаны на фиктивных данных.
3. **По 1 пилотному реальному экрану на архетип** — доказательство, что каркас работает на настоящих данных и правах, и эталон для Фазы 4.

## 3. Объём

**Входит:**

- 4 архетипа: **Dashboard, Список (list), Карточка (detail), Форма (form)** — вместе ~78 из 93 экранов.
- Новые компоненты верхнего слоя в `packages/ui` + доработка фронтовых обёрток.
- Витрина `/admin/ui-kit`.
- 4 пилотных экрана.

**Не входит (осознанно, YAGNI):**

- Архетипы «плеер» (тест/прокторинг, 2), «мастер» (bulk-enrollments, 1), «прочее» (авторизация/ошибки/заглушки, 12) — переиспользуют ту же оболочку, отдельные шаблоны пока не нужны.
- Массовая миграция экранов (это Фаза 4).
- Тёмная тема / адаптив / полный a11y-проход (Фаза 6) — но новые каркасы **не должны их ломать** (используют `var(--ui-*)`, сохраняют/усиливают a11y).
- Любые изменения URL, `routeMeta`/RBAC (кроме одной новой записи для `/admin/ui-kit`), бэкенда, миграций, прав.

## 4. Канонический скелет

Все 4 архетипа разделяют спину:

```
<ProtectedPage>            // widgets/shell/protected-page → AppShell (сайдбар+крошки+auth) — НЕ трогаем
  <PageContainer>          // <main className="ui-page">
    <PageHeader            // h1.ui-page-title + subtitle + actions-слот
      title subtitle actions />
    … секции по архетипу …
```

`PageHeader`/`PageContainer` уже есть в `apps/frontend/src/components/state-wrappers.tsx`. Каркасы ниже наполняют «тело».

### 4.1 Dashboard

```
PageHeader (+ действие «Обновить»/role-switcher)
Hero            (опц. индиго-градиентный баннер «Следующий шаг» + коралловая CTA)
StatGrid        (ряд KPI-плиток на StatCard)
DashboardTile[] (сетка плиток-ссылок, фильтруется по ролям)
SectionCard[]   (график / таблица / список — опционально)
```

Обязан покрыть: единый ряд KPI на `StatCard` (убить 3 разные отрисовки); один общий каталог плиток (сейчас `roleWidgets` в `mvp/screens.tsx` дублирует `widgetCatalog` в `app/page.tsx`); самосхлопывающееся многоколоночное тело; слот фильтра сверху; независимость от источника данных.

### 4.2 Список (list)

```
PageHeader (+ «Создать» / «Экспорт»)
Toolbar     (поиск + фильтры: select / date-range / checkbox)
AsyncSection → DataTable + Pagination
```

Обязан покрыть: гибкие фильтры из одного источника опций статуса; пагинацию page- **и** offset-based; колонку действий строки (Drawer + деструктив через `ConfirmDialog`, не `window.confirm`); опциональный inline-create; единый контракт `{ items, total, isLoading, error, refetch }`; действия под правами (`PermissionGate`).

### 4.3 Карточка (detail) — **две колонки** (решение владельца)

```
PageHeader (заголовок + ОДНА статус-пилюля + кластер действий: primary/secondary/destructive + «назад»)
ранние return-guard'ы (loading / error / not-found / forbidden)
DetailLayout:
  main  → SectionCard[] (KeyValueList-блок, связанный список = DataTable, edit-аффорданс)
  aside → KeyValueList (сводка) + статус
```

`DetailLayout` — двухколоночная сетка (`main` ~1.7fr + `aside` ~320px), **схлопывается в одну колонку** на узких экранах (CSS breakpoint). Обязан покрыть: канонический `KeyValueList` (убить 3 варианта `<dl>`); inline-edit **и** Drawer-edit; действия на уровне секции; произвольные кастомные подсекции; гейтинг действий по статусу/правам.

### 4.4 Форма (form)

```
PageHeader
guard'ы
Form (ui-form, ограниченная токеном макс-ширина)
  FormSection → Field[] (label / required / hint / error / aria)
  form-level ошибка + focus-first-error
  FormActions (primary «Сохранить» / secondary «Отмена»)
```

Обязан покрыть: единый примитив `Field` (заменяет 158 «сырых» `<input>` и 3 разметки); ошибки на уровне поля **и** формы с фокусом на первую ошибку; привязку submit, сворачивающую pending/toast/catch (паттерн `useDomainMutations.wrap` из `features/mvp/hooks.ts`); хостинг на странице **и** в `Dialog` (`ui-modal-actions`); переключение edit/view; динамические повторяемые строки.

## 5. Новые компоненты `@trudskill/ui`

Живут в композиционном слое `packages/ui/src/patterns/` (переиспользуем существующую заглушку `registry.tsx`) или новом `packages/ui/src/composition/` — уточняется в плане. Каждый маппится на существующий bare-CSS.

| Компонент                              | Назначение                                                                                                  | Опирается на                                          |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| `AsyncSection`                         | цепочка `loading → error+retry → empty+hint → children` из единого `{ isLoading, error, isEmpty, onRetry }` | `LoadingState`/`ErrorState`/`EmptyState`              |
| `ListPage`                             | шапка + toolbar-слот + `AsyncSection`(таблица) + пагинация                                                  | `PageHeader`, `DataTable`, `Pagination`, `FilterBar`  |
| `Toolbar`                              | ряд поиск + фильтры + действия                                                                              | `Search`, `Select`, `DateRange`, `Button`             |
| `DetailLayout`                         | 2 колонки `main`/`aside`, схлоп на узком                                                                    | bare-CSS grid в `layout.ts`                           |
| `StatGrid`                             | сетка KPI                                                                                                   | `StatCard`                                            |
| `DashboardTile`                        | плитка-ссылка                                                                                               | `.ui-dashboard-tile`                                  |
| `Hero`                                 | герой-баннер «Следующий шаг»                                                                                | `--ui-hero-*`                                         |
| `Form` / `FormSection` / `FormActions` | одноколоночная форма, focus-first-error, page + Dialog                                                      | `.ui-form`, `forms.ts`                                |
| `Field`                                | единый ввод (label/required/hint/error/aria)                                                                | существующий `FormField` (расширить/переиспользовать) |
| `Drawer`                               | боковая панель с focus-trap (паритет с `Modal`)                                                             | `modal.ts` (зеркало `Dialog`)                         |

**Контракт данных.** Каркасы (`ListPage`, `AsyncSection`, `DetailLayout`) принимают нормализованные пропсы, а не конкретный хук: `{ items, total, isLoading, error, refetch }` (список) и `{ data, isLoading, error }` (карточка). Адаптер к React-Query и к самописному `{ data, loading, error }` — на стороне вызова, чтобы каркас не зависел от источника.

## 6. Доработка фронтовых обёрток

`apps/frontend/src/components/state-wrappers.tsx`:

- `SectionCard` получает опциональные слоты `actions` и `subtitle`.
- Свести дублирующийся `PageContainer` (ui-примитив ↔ фронтовая обёртка) к одному источнику.
- (Опц.) `PageLayout` — обёртка `header + toolbar + content + state-routing` для типовых страниц.

## 7. Живая витрина

- Маршрут `/admin/ui-kit` (страница `apps/frontend/app/admin/ui-kit/page.tsx` → экран во `features/ui-kit`).
- Показывает каждый каркас на фиктивных данных: dashboard, список, карточка, форма + галерея примитивов.
- **RBAC:** новая запись в `routeMeta` под правом уровня админа (например `auth.manage_sessions`, как `/admin/licenses`); в основное меню не добавляем (справочная страница). Инвариант §5.154 «каждая nav-ссылка резолвится в routeMeta» не нарушается (ссылки в меню нет), но запись `routeMeta` обязательна, иначе `evaluateRouteAccess` вернёт not-found.

## 8. Пилоты (1 реальный экран на архетип)

| Архетип   | Пилотный файл                                                                          | Почему                                                                                                                 |
| --------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Список    | `apps/frontend/src/features/learners/learners-list-screen.tsx`                         | чистейший; близнецы — clients/tests/question-banks/assignments                                                         |
| Карточка  | `apps/frontend/src/features/clients/client-detail-screen.tsx`                          | компактный (~138 строк); стресс-эталон — `mvp/screens.tsx` CommissionDetailsScreen                                     |
| Форма     | `apps/frontend/app/academy/requisites/page.tsx`                                        | самая слабая разметка = максимально видимый выигрыш                                                                    |
| Dashboard | `apps/frontend/src/features/analytics/screens.tsx` (либо `app/admin/cockpit/page.tsx`) | больше всего слотов; механическая замена `stat-card`→`StatCard`; эталон hero/мультиколонки — `learner-home-screen.tsx` |

Каждый пилот мигрируется на новый каркас **без изменения поведения, данных, прав и URL** — только композиция.

## 9. Нормализации, которые вводят каркасы

1. Единый `AsyncSection` вместо копипаста состояний.
2. Принятие обоих контрактов хука (React-Query и `useState`).
3. Принуждение к простаивающим примитивам (`StatCard`/`KeyValueList`/`Field`/`Button`).
4. `window.confirm` → `ConfirmDialog`.
5. Инлайновые `style={{}}` → токены `var(--ui-*)`.
6. Дедуп каталогов/валидаторов (`roleWidgets` vs `widgetCatalog`; локальные `EMAIL_RE`).

Нормализации применяются **в рамках пилотов**; массовое вычищение — Фаза 4.

## 10. Тестирование и гейты

- **Юнит-тесты новых компонентов** — по существующему харнессу `packages/ui`: компонент вызывается **как функция**, проверяются `props`/структура возвращённого `ReactElement` (см. `button.test.tsx`, `states.test.tsx`) — **без монтирования DOM**. Интерактивное поведение `Drawer` (focus-trap) тестируется по образцу текущего `Modal`/`Dialog`.
- **TDD:** RED→GREEN на каждый компонент и каждый пилот.
- **Фронтовые e2e** (`src/e2e/*`, без React-mount): `/admin/ui-kit` резолвится в `routeMeta`; инвариант nav↔routeMeta сохранён.
- **Гейты (все зелёные):** `pnpm test:frontend`, `pnpm --filter @trudskill/ui test`, typecheck (`tsc --noEmit`), full ESLint (`--max-warnings=0`, включая запрет прямого `lucide-react` из Фазы 2 — иконки только через `<Icon>`).
- **Токен-дисциплина:** новый CSS (если появится) — только `var(--ui-*)`; страж `token-discipline.test.ts` не краснеет.

## 11. Ограничения (жёсткие)

- Не ломать URL; RBAC-фильтр (`routeMeta` + `hasPermission`) нетронут (кроме +1 записи `/admin/ui-kit`).
- Тесты фронтенда + typecheck зелёные после каждой задачи.
- Сохранять/усиливать a11y (aria-контракты примитивов, focus-visible, focus-trap у Drawer).
- Без миграций / новых прав / изменений бэкенда.
- Иконки — только `<Icon>` из `@trudskill/ui` (ESLint-страж Фазы 2).

## 12. Влияние на Фазу 4 (обоснование приоритета)

Список (~47) и карточка (~14) построены на `DataTable` + `state-wrappers`, поэтому выпуск этих двух каркасов первым разблокирует **~65%** всех экранов. Самая рычажная одиночная миграция потом — монолит `apps/frontend/src/features/mvp/screens.tsx` (держит list+detail+form+dashboard-образцы сразу).

## 13. Открытые вопросы / решить в плане

- Точное место компонентов: `patterns/` (переиспользовать заглушку) vs новый `composition/`.
- Dashboard-пилот: `analytics` (данные-дашборд) или `admin/cockpit` (плиточный) — выбрать по видимому выигрышу.
- Нужен ли `PageLayout` сейчас или достаточно каркасов архетипов (склоняюсь: достаточно, `PageLayout` — опционально).

## 14. Отклонения от плана

_(заполняется по ходу реализации)_
