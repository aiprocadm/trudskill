# UI Фаза 4 — под-PR 1a: списочные экраны монолита `mvp/screens.tsx`

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** нормализовать цепочку состояний (загрузка→ошибка→пусто→контент) 6 списочных экранов монолита через каркас `AsyncSection`, **без единого изменения вида, поведения, данных, прав, URL**.

**Architecture:** «wrap, don't reshape». Ручная тройка `{loading?<LoadingState/>}{error?<SectionError/>}{empty?<SectionEmpty/>}` заменяется на `<AsyncSection isLoading error isEmpty …>{тело}</AsyncSection>`. DOM `AsyncSection` **побайтово совпадает** с текущими `LoadingState`/`SectionError`/`SectionEmpty` (проверено: см. §«Почему это zero-change»). Вёрстка тела (таблицы, `<ul>`-ссылки, карточки, фильтры, пагинация, формы) сохраняется дословно.

**Tech Stack:** Next.js 15 App Router, `@trudskill/ui` (`AsyncSection`, `DataTable`, `Button`), React `useState`-хуки данных монолита (`useUsersList`, `useCoursesList` и т.д.).

**Standard (owner, 2026-07-13):** «сохранять вид / zero-change». `ListPage` (он рисует `DataTable`) применяем ТОЛЬКО там, где экран уже таблица. Link-списки/карточки — тело не трогаем. Локальный `PaginationControls` (Назад/Далее) НЕ меняем на ui `Pagination` (номера страниц) — другой вид.

---

## Почему это zero-change (обязательно к прочтению перед задачами)

Файл `packages/ui/src/composition/async-section.tsx` рендерит:

- `isLoading` → `<LoadingState message?/>` — тот же компонент `@trudskill/ui`, что зовут экраны.
- `error` (truthy) → `<div className="ui-stack"><ErrorState message={error.message}/> {onRetry? кнопка «Повторить»}</div>` — **идентично** `SectionError` из `apps/frontend/src/components/state-wrappers.tsx:13`.
- `isEmpty` → `<EmptyState message? hint?/>` — **идентично** `SectionEmpty` (`state-wrappers.tsx:24`).
- иначе → `children`.

**Две ловушки (инвариант нарушится, если их пропустить):**

1. **Строковая ошибка.** Хуки монолита кладут `error` в `SectionError message={error}` как строку. `AsyncSection` вычисляет `error instanceof Error ? error.message : undefined`. Поэтому передавать **обёрнутую** ошибку: `error={dataError ? new Error(dataError) : undefined}`. Иначе текст ошибки исчезнет (default «Не удалось загрузить данные»).
2. **`loadingMessage`.** Передавать текущий текст загрузки экрана (напр. `loadingMessage="Загрузка списка пользователей…"`), иначе загрузка покажет дефолт «Загрузка…».

**Общий инвариант порядка состояний** (у `AsyncSection`): loading → error → empty → content. Совпадает с текущими экранами, т.к. их empty-условие всегда содержит `&& !loading` (и обычно `&& !error`).

**Общие хелперы монолита не ломать:** `RegistryControls`, `UsersFilterBar`, `PaginationControls`, `ListSkeleton`, `MutationError`, `ProgressBar`, `toTableRows` используются несколькими экранами — их поведение/сигнатуры сохраняем.

**Исключено из под-PR 1a:** `LearnerCoursesScreen` — грузится через `ListSkeleton` (скелетон), а `AsyncSection` рисует текстовый `LoadingState`; обёртка изменит вид. Оставляем как есть (заметка для backlog: если `AsyncSection` получит слот кастомного loading — вернуться).

---

## Файловая структура

- Modify: `apps/frontend/src/features/mvp/screens.tsx` — 6 экранов (`UsersPageScreen`, `CoursesPageScreen`, `CounterpartiesPageScreen`, `DirectionsPageScreen`, `GroupsPageScreen`, `CommissionsPageScreen`).
  - Добавить `AsyncSection` в существующий импорт `from '@trudskill/ui'` (строка 3).
  - Проверить: если после миграции `LoadingState`/`SectionError`/`SectionEmpty` больше не используются НИ В ОДНОМ оставшемся экране файла — убрать из импортов; если используются (карточки/формы/детали) — оставить.
- Без новых файлов, миграций, прав, изменений бэкенда/контрактов.

---

## Верификация (для каждой задачи и всей пачки)

Репозиторий НЕ юнит-тестирует JSX экранов (см. CLAUDE.md «Frontend conventions»: никаких `render()`; «e2e» = permission/routing). Поэтому «тест» рефактора = зелёные гейты + adversarial diff-review + визуальная проверка:

- `pnpm --filter @trudskill/frontend exec vitest run --no-file-parallelism` — существующие тесты зелёные.
- `pnpm typecheck` — 8/8.
- `npx eslint apps/frontend/src/features/mvp/screens.tsx --max-warnings=0` — чисто.
- (Вся пачка, после последней задачи) визуальный спот-чек 2–3 экранов в браузере: загрузка/ошибка/пусто/контент выглядят как раньше.

**Adversarial diff-review каждого экрана** сверяет `git show HEAD:…/screens.tsx` (оригинал) с новой версией и целится в: потерянный обработчик, изменённое условие видимости/прав, потерянный текст ошибки/загрузки/пусто, изменённый порядок/вид состояния, случай «ошибка при наличии устаревших данных» (см. Task 1).

---

## Task 1: `CommissionsPageScreen` (настоящая таблица) — эталон пачки

**Files:** Modify `apps/frontend/src/features/mvp/screens.tsx` (текущий блок ~2619–2627).

- [ ] **Step 1: Добавить `AsyncSection` в импорт `@trudskill/ui`** (строка 3), сохранив остальные именованные импорты и алфавитный порядок (ESLint `sort-imports`).

- [ ] **Step 2: Заменить ручную тройку состояний таблицы на `AsyncSection`.**

Было:

```tsx
{
  loading ? <LoadingState message="Загрузка…" /> : null;
}
{
  error ? <SectionError message={error} /> : null;
}
{
  data && data.items.length > 0 ? (
    <DataTable columns={commissionColumns} rows={data.items} />
  ) : null;
}
{
  data && data.items.length === 0 && !loading ? (
    <SectionEmpty message="Комиссии не созданы" hint="Создайте первую комиссию ниже" />
  ) : null;
}
```

Стало:

```tsx
<AsyncSection
  isLoading={loading}
  error={error ? new Error(error) : undefined}
  isEmpty={!!data && data.items.length === 0}
  loadingMessage="Загрузка…"
  emptyMessage="Комиссии не созданы"
  emptyHint="Создайте первую комиссию ниже"
>
  <DataTable columns={commissionColumns} rows={data?.items ?? []} />
</AsyncSection>
```

Сохранить дословно: фильтр статуса + кнопку «Обновить» (`refetch`) над таблицей, всю секцию «Создать новую комиссию» (форма, `onCreate`, `saveError`, `FieldError`), обе `<button className="ui-button…">` (в этой задаче НЕ трогаем — примитивы Button не в scope 1a, только state-каскад). `onRetry` НЕ передавать (сейчас у `SectionError` его нет — добавить кнопку = изменение вида).

- [ ] **Step 3: Гейты.** `npx eslint apps/frontend/src/features/mvp/screens.tsx --max-warnings=0` → чисто; `pnpm typecheck` → 8/8; `pnpm --filter @trudskill/frontend exec vitest run --no-file-parallelism` → зелёные.

- [ ] **Step 4: Commit.**

```bash
git add apps/frontend/src/features/mvp/screens.tsx
git commit -m "refactor(frontend): CommissionsPage — таблица на AsyncSection (Фаза 4, под-PR 1a)"
```

## Task 2: `UsersPageScreen` (гибрид таблица + список-ссылок) — самый аккуратный

**Files:** Modify `screens.tsx` (блок ~282–307).

- [ ] **Step 1: Обернуть КОНТЕНТ (DataTable + `<div>` со списком ссылок) в `AsyncSection`; фильтры и пагинацию оставить снаружи.**

Было:

```tsx
<UsersFilterBar … />
{loading ? <LoadingState message="Загрузка списка пользователей…" /> : null}
{error ? <SectionError message={error} /> : null}
{data?.items.length ? (
  <DataTable stickyFirstColumn columns={[…]} rows={toTableRows(data.items)} />
) : null}
{!loading && !error && !data?.items.length ? (
  <SectionEmpty message="Нет пользователей" />
) : null}
<div className="ui-stack" style={{ gap: 8 }}>
  {data?.items.map((user) => ( … Link + StatusChip + «Только просмотр» … ))}
</div>
<PaginationControls page={page} setPage={setPage} total={data?.total} pageSize={20} />
```

Стало:

```tsx
<UsersFilterBar … />
<AsyncSection
  isLoading={loading}
  error={error ? new Error(error) : undefined}
  isEmpty={!data?.items.length}
  loadingMessage="Загрузка списка пользователей…"
  emptyMessage="Нет пользователей"
>
  <DataTable stickyFirstColumn columns={[…]} rows={toTableRows(data?.items ?? [])} />
  <div className="ui-stack" style={{ gap: 8 }}>
    {(data?.items ?? []).map((user) => ( … без изменений … ))}
  </div>
</AsyncSection>
<PaginationControls page={page} setPage={setPage} total={data?.total} pageSize={20} />
```

Сохранить: `stickyFirstColumn`, точный набор колонок, содержимое `.map` (Link `Открыть карточку {displayName}`, `StatusChip`, `!canManage ? <small>Только просмотр</small>`), `canManage`/`hasPermission`, `PaginationControls` со всеми пропсами.

- [ ] **Step 2: Проверить семантику ошибки хука `useUsersList`.** Если при `error` хук СОХРАНЯЕТ устаревшие `data` — старый код показывал бы ошибку И список одновременно, а новый покажет только ошибку. Открыть `apps/frontend/src/features/mvp/hooks.ts` (`useUsersList`) и убедиться, что на ошибке `data` сбрасывается/не задаётся (тогда список и так пуст → эквивалентно). Если сохраняется — зафиксировать как осознанное отклонение в §Deviations и в handoff (это единственный тонкий риск задачи).

- [ ] **Step 3: Гейты** (как Task 1, Step 3).

- [ ] **Step 4: Commit.**

```bash
git commit -am "refactor(frontend): UsersPage — контент на AsyncSection, гибрид таблица+ссылки сохранён (Фаза 4, под-PR 1a)"
```

## Task 3: `CoursesPageScreen` (список-ссылки `<ul>` + фильтры + пагинация)

**Files:** Modify `screens.tsx` (блок ~626–637).

- [ ] **Step 1: Обернуть `<ul>` со ссылками в `AsyncSection`; `RegistryControls`, фильтр направлений и `PaginationControls` — снаружи.**

Было:

```tsx
{loading ? <LoadingState message="Загрузка…" /> : null}
{error ? <SectionError message={error} /> : null}
<ul> {data?.items.map((course) => ( <li><Link…/>{StatusChip}</li> ))} </ul>
{!loading && !error && !data?.items.length ? <SectionEmpty message="Нет курсов" /> : null}
<PaginationControls … />
```

Стало:

```tsx
<AsyncSection
  isLoading={loading}
  error={error ? new Error(error) : undefined}
  isEmpty={!data?.items.length}
  loadingMessage="Загрузка…"
  emptyMessage="Нет курсов"
>
  <ul>
    {(data?.items ?? []).map((course) => ( … без изменений: Link + StatusChip … ))}
  </ul>
</AsyncSection>
<PaginationControls … />
```

Сохранить: `PageHeader` с `actions` (кнопка «Создать курс» / `canCreateCourse`/`hasPermission`), `RegistryControls`, `FilterBar` с `<select>` направлений, `PaginationControls`.

- [ ] **Step 2: Гейты** (как Task 1, Step 3).
- [ ] **Step 3: Commit** `refactor(frontend): CoursesPage — список на AsyncSection (Фаза 4, под-PR 1a)`.

## Task 4: `CounterpartiesPageScreen` (стек ссылок + пагинация)

**Files:** Modify `screens.tsx` (блок ~520–532).

- [ ] **Step 1: Обернуть `<div class="ui-stack">` со ссылками в `AsyncSection`; `RegistryControls` и `PaginationControls` — снаружи.**

Было:

```tsx
{loading ? <LoadingState message="Загрузка…" /> : null}
{error ? <SectionError message={error} /> : null}
<div className="ui-stack" style={{ gap: 8 }}>
  {data?.items.map((item) => ( <Link…>{item.name} ({item.code})</Link> ))}
</div>
{!loading && !error && !data?.items.length ? <SectionEmpty message="Нет контрагентов" /> : null}
<PaginationControls … />
```

Стало:

```tsx
<AsyncSection
  isLoading={loading}
  error={error ? new Error(error) : undefined}
  isEmpty={!data?.items.length}
  loadingMessage="Загрузка…"
  emptyMessage="Нет контрагентов"
>
  <div className="ui-stack" style={{ gap: 8 }}>
    {(data?.items ?? []).map((item) => ( … без изменений … ))}
  </div>
</AsyncSection>
<PaginationControls … />
```

Внимание: тут empty был БЕЗ `!loading && !error &&`?, нет — он `!loading && !error && !data?.items.length`. `isEmpty` в AsyncSection оценивается только когда не loading и не error — эквивалентно.

- [ ] **Step 2: Гейты** (как Task 1, Step 3).
- [ ] **Step 3: Commit** `refactor(frontend): CounterpartiesPage — список на AsyncSection (Фаза 4, под-PR 1a)`.

## Task 5: `GroupsPageScreen` (список-ссылки `<ul>` + пагинация)

**Files:** Modify `screens.tsx` (блок ~1545–1555).

- [ ] **Step 1: Обернуть `<ul>` в `AsyncSection`** по образцу Task 3 (без фильтров). Сохранить `PageHeader` `actions` (кнопка «Создать группу» / `canCreateGroup`), `PaginationControls`.

```tsx
<AsyncSection
  isLoading={loading}
  error={error ? new Error(error) : undefined}
  isEmpty={!data?.items.length}
  loadingMessage="Загрузка…"
  emptyMessage="Нет групп"
>
  <ul>
    {(data?.items ?? []).map((group) => ( <li key={group.id}><Link href={`/groups/${group.id}`}>{group.name}</Link></li> ))}
  </ul>
</AsyncSection>
<PaginationControls … />
```

- [ ] **Step 2: Гейты** (как Task 1, Step 3).
- [ ] **Step 3: Commit** `refactor(frontend): GroupsPage — список на AsyncSection (Фаза 4, под-PR 1a)`.

## Task 6: `DirectionsPageScreen` (голый `<ul>`, без empty/пагинации)

**Files:** Modify `screens.tsx` (блок ~574–581).

- [ ] **Step 1: Обернуть `<ul>` в `AsyncSection` только для loading/error (empty НЕ добавлять — его сейчас нет).**

Было:

```tsx
{
  loading ? <LoadingState message="Загрузка…" /> : null;
}
{
  error ? <SectionError message={error} /> : null;
}
<ul>
  {' '}
  {data?.items.map((item) => (
    <li>{item.name}</li>
  ))}{' '}
</ul>;
```

Стало:

```tsx
<AsyncSection
  isLoading={loading}
  error={error ? new Error(error) : undefined}
  loadingMessage="Загрузка…"
>
  <ul>
    {(data?.items ?? []).map((item) => (
      <li key={item.id}>{item.name}</li>
    ))}
  </ul>
</AsyncSection>
```

`isEmpty` не передаём (default `false`) — экран и раньше при пустых данных рисовал пустой `<ul>` без сообщения. Zero-change.

- [ ] **Step 2: Гейты** (как Task 1, Step 3).
- [ ] **Step 3: Commit** `refactor(frontend): DirectionsPage — список на AsyncSection (Фаза 4, под-PR 1a)`.

## Task 7: Чистка импортов + финальная верификация пачки

**Files:** Modify `screens.tsx` (импорты, строки 3, 48–54).

- [ ] **Step 1:** Проверить `grep -n "LoadingState\|SectionError\|SectionEmpty" screens.tsx`. Убрать из импортов ТОЛЬКО те, что больше нигде в файле не используются (детали/формы/дашборды в том же файле их ещё зовут — тогда оставить). Не удалять `SectionCard`/`PageHeader`/`PageContainer` (используются всюду).
- [ ] **Step 2: Полные гейты пачки:** eslint (файл) + `pnpm typecheck` + `pnpm --filter @trudskill/frontend exec vitest run --no-file-parallelism`.
- [ ] **Step 3: Визуальный спот-чек** (если поднят стек): открыть `/admin/commissions`, `/courses`, `/users` — состояния загрузка/пусто/контент как раньше.
- [ ] **Step 4: Adversarial diff-review** всей пачки против `origin/main:apps/frontend/src/features/mvp/screens.tsx` — цель: ни одного потерянного обработчика/условия прав/текста; особый фокус — Task 2 Step 2 (устаревшие данные при ошибке).
- [ ] **Step 5: Commit** чистки импортов (если были) `chore(frontend): почистить неиспользуемые импорты состояний в mvp/screens.tsx (Фаза 4, под-PR 1a)`.

---

## Definition of Done (под-PR 1a)

- 6 экранов используют `AsyncSection` вместо ручной тройки; тело/фильтры/пагинация/формы/права/URL — дословно прежние.
- `LearnerCoursesScreen` осознанно не тронут (скелетон-загрузка).
- Гейты зелёные: frontend vitest, `pnpm typecheck` 8/8, eslint по файлу чисто.
- Adversarial diff-review пройден (находки перепроверены скептиками, как в Фазе 3).
- README §2 + handoff §5.165 обновлены; без миграций/новых прав/бэкенда.

## Deviations

_(заполняется по ходу; в частности — результат проверки Task 2 Step 2 про устаревшие данные при ошибке.)_
