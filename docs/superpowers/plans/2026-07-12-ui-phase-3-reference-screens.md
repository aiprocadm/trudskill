# UI redesign Фаза 3 — эталонные шаблоны экранов: план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Дать 6 переиспользуемых компонентов-каркасов в `@trudskill/ui`, живую витрину `/admin/ui-kit` и по 1 мигрированному реальному экрану на архетип (dashboard/список/карточка/форма), чтобы миграция Фазы 4 стала механической.

**Architecture:** Новый композиционный слой `packages/ui/src/composition/` кладётся поверх уже существующего CSS (`packages/ui/src/styles/*`); визуал не меняется. Компоненты — чистые функции (тестируются вызовом-как-функция, как весь `packages/ui`). Пилоты мигрируют композицию без изменения поведения/данных/прав/URL.

**Tech Stack:** React 18 + TypeScript (`exactOptionalPropertyTypes: true`), Vitest (без DOM-mount — ассерты по `element.type`/`.props`), Next.js 15 App Router (пилоты/витрина), pnpm + Turborepo.

**Соглашения кодовой базы (соблюдать точно):**

- Исходники импортируют без суффикса: `from '../components/states/index'`. **Тесты** импортируют с `.js`: `from './async-section.js'`.
- `exactOptionalPropertyTypes`: не передавать `undefined` в опциональные пропсы — использовать условный спред `{...(x ? { prop: x } : {})}`.
- Новый CSS — только `var(--ui-space-*)` / `var(--ui-radius-*)` (страж `packages/ui/src/styles/token-discipline.test.ts`).
- Иконки только через `<Icon>` из `@trudskill/ui` (ESLint `no-restricted-imports` на `lucide-react`).
- Каждая задача — TDD (RED → GREEN) и отдельный коммит (Conventional Commits, HEREDOC для многострочных).

**Прогон одиночного теста:**

- ui: `pnpm --filter @trudskill/ui exec vitest run src/composition/<file>.test.tsx --no-file-parallelism`
- frontend: `pnpm --filter @trudskill/frontend exec vitest run <path> --no-file-parallelism`

**Решения по §13 спеки (приняты):** место компонентов — новый `packages/ui/src/composition/`; dashboard-пилот — `analytics` (там нормализация «6 сырых stat-card → StatCard» + подделанные loading/error); `PageLayout` не делаем (каркасов архетипов достаточно). **Сужено по YAGNI:** `Drawer` (существующий `Dialog` уже с focus-trap покрывает edit), `Hero` и `DashboardTile` (используют `.ui-hero`/`next/link` на уровне приложения; каноном остаётся `NextStepCard`), дедуп каталогов плиток — вынесены за Фазу 3.

---

## Обзор файлов

**Создать (packages/ui):**

- `packages/ui/src/composition/async-section.tsx` (+ `.test.tsx`)
- `packages/ui/src/composition/stat-grid.tsx` (+ `.test.tsx`)
- `packages/ui/src/composition/detail-layout.tsx` (+ `.test.tsx`)
- `packages/ui/src/composition/list-page.tsx` (+ `.test.tsx`)
- `packages/ui/src/composition/form.tsx` (+ `.test.tsx`)
- `packages/ui/src/composition/select-field.tsx` (+ `.test.tsx`)
- `packages/ui/src/composition/index.tsx` (barrel)

**Изменить (packages/ui):**

- `packages/ui/src/styles/layout.ts` — CSS `.ui-detail*`
- `packages/ui/src/index.tsx` — `export * from './composition/index'`

**Создать (frontend):**

- `apps/frontend/src/features/ui-kit/gallery-screen.tsx`
- `apps/frontend/app/admin/ui-kit/page.tsx`
- `apps/frontend/src/features/navigation/ui-kit-route.test.ts`

**Изменить (frontend):**

- `apps/frontend/src/components/state-wrappers.tsx` — слоты `actions`/`subtitle` у `SectionCard`
- `apps/frontend/src/features/navigation/model.ts` — routeMeta `/admin/ui-kit`
- `apps/frontend/src/features/learners/learners-list-screen.tsx` — пилот списка
- `apps/frontend/src/features/clients/client-detail-screen.tsx` — пилот карточки
- `apps/frontend/app/academy/requisites/page.tsx` — пилот формы
- `apps/frontend/src/features/analytics/screens.tsx` — пилот dashboard
- `README.md`, `LMS_AGENT_HANDOFF.md` — handoff

---

## Task 1: `AsyncSection` — единая цепочка состояний

**Files:**

- Create: `packages/ui/src/composition/async-section.tsx`
- Test: `packages/ui/src/composition/async-section.test.tsx`

- [x] **Step 1: Написать падающий тест**

```tsx
import { describe, expect, it } from 'vitest';

import { AsyncSection } from './async-section.js';
import { EmptyState, ErrorState, LoadingState } from '../components/states/index.js';

describe('AsyncSection — единая цепочка состояний', () => {
  it('isLoading → LoadingState (первым приоритетом)', () => {
    const el = AsyncSection({ isLoading: true, children: 'DATA' });
    expect(el.type).toBe(LoadingState);
  });

  it('error → ui-stack с ErrorState (message из Error) и кнопкой «Повторить»', () => {
    const el = AsyncSection({
      isLoading: false,
      error: new Error('boom'),
      onRetry: () => {},
      children: 'DATA'
    });
    expect(el.props.className).toBe('ui-stack');
    const [err, retry] = el.props.children as any[];
    expect(err.type).toBe(ErrorState);
    expect(err.props.message).toBe('boom');
    expect(retry.props.children).toBe('Повторить');
  });

  it('error без onRetry → без кнопки', () => {
    const el = AsyncSection({ isLoading: false, error: 'x', children: 'DATA' });
    const [, retry] = el.props.children as any[];
    expect(retry).toBeNull();
  });

  it('isEmpty → EmptyState', () => {
    const el = AsyncSection({ isLoading: false, isEmpty: true, children: 'DATA' });
    expect(el.type).toBe(EmptyState);
  });

  it('готово → Fragment с children', () => {
    const el = AsyncSection({ isLoading: false, children: 'DATA' });
    expect(el.props.children).toBe('DATA');
  });
});
```

- [x] **Step 2: Запустить — убедиться что падает**

Run: `pnpm --filter @trudskill/ui exec vitest run src/composition/async-section.test.tsx --no-file-parallelism`
Expected: FAIL — «Failed to resolve import './async-section.js'».

- [x] **Step 3: Реализация**

```tsx
import { EmptyState, ErrorState, LoadingState } from '../components/states/index';

import type { ReactElement, ReactNode } from 'react';

export interface AsyncSectionProps {
  isLoading: boolean;
  error?: unknown;
  isEmpty?: boolean;
  onRetry?: () => void;
  loadingMessage?: string;
  emptyMessage?: string;
  emptyHint?: string;
  children: ReactNode;
}

// Единая цепочка загрузка → ошибка(+повтор) → пусто → контент.
// Заменяет копипаст isLoading?/error?/empty? в экранах (см. §5.16x Фаза 3).
export const AsyncSection = ({
  isLoading,
  error,
  isEmpty = false,
  onRetry,
  loadingMessage,
  emptyMessage,
  emptyHint,
  children
}: AsyncSectionProps): ReactElement => {
  if (isLoading) {
    return <LoadingState {...(loadingMessage ? { message: loadingMessage } : {})} />;
  }
  if (error) {
    const message = error instanceof Error ? error.message : undefined;
    return (
      <div className="ui-stack">
        <ErrorState {...(message ? { message } : {})} />
        {onRetry ? (
          <button type="button" className="ui-button" onClick={onRetry}>
            Повторить
          </button>
        ) : null}
      </div>
    );
  }
  if (isEmpty) {
    return (
      <EmptyState
        {...(emptyMessage ? { message: emptyMessage } : {})}
        {...(emptyHint ? { hint: emptyHint } : {})}
      />
    );
  }
  return <>{children}</>;
};
```

- [x] **Step 4: Запустить — зелёный**

Run: `pnpm --filter @trudskill/ui exec vitest run src/composition/async-section.test.tsx --no-file-parallelism`
Expected: PASS (5 тестов).

- [x] **Step 5: Коммит**

```bash
git add packages/ui/src/composition/async-section.tsx packages/ui/src/composition/async-section.test.tsx
git commit -m "feat(ui): AsyncSection — единая цепочка загрузка/ошибка/пусто/контент (Фаза 3)"
```

---

## Task 2: `StatGrid` — ряд KPI на StatCard

**Files:**

- Create: `packages/ui/src/composition/stat-grid.tsx`
- Test: `packages/ui/src/composition/stat-grid.test.tsx`

- [x] **Step 1: Тест**

```tsx
import { describe, expect, it } from 'vitest';

import { StatGrid } from './stat-grid.js';
import { StatCard } from '../components/stat-card/index.js';

describe('StatGrid — ряд KPI поверх StatCard', () => {
  it('рендерит div.stat-grid со StatCard на каждый элемент', () => {
    const el = StatGrid({
      items: [
        { label: 'Слушателей', value: 1248 },
        { label: 'Групп', value: 37, sub: 'активных' }
      ]
    });
    expect(el.props.className).toBe('stat-grid');
    const cards = el.props.children as any[];
    expect(cards).toHaveLength(2);
    expect(cards[0].type).toBe(StatCard);
    expect(cards[0].props.label).toBe('Слушателей');
    expect(cards[0].props.value).toBe(1248);
    expect(cards[1].props.sub).toBe('активных');
  });

  it('sub опускается, если не задан (exactOptionalPropertyTypes)', () => {
    const el = StatGrid({ items: [{ label: 'A', value: 1 }] });
    const [card] = el.props.children as any[];
    expect(card.props.sub).toBeUndefined();
  });
});
```

- [x] **Step 2: Запуск — FAIL** (`src/composition/stat-grid.test.tsx`).

- [x] **Step 3: Реализация**

```tsx
import { StatCard } from '../components/stat-card/index';

import type { ReactElement, ReactNode } from 'react';

export interface StatGridItem {
  label: string;
  value: ReactNode;
  sub?: string;
}

// Канонический ряд метрик. Убивает 3 разные ручные отрисовки KPI (см. карту Фазы 3).
export const StatGrid = ({ items }: { items: StatGridItem[] }): ReactElement => (
  <div className="stat-grid">
    {items.map((item, index) => (
      <StatCard
        key={`${item.label}-${index}`}
        label={item.label}
        value={item.value}
        {...(item.sub ? { sub: item.sub } : {})}
      />
    ))}
  </div>
);
```

- [x] **Step 4: Запуск — PASS.**

- [x] **Step 5: Коммит**

```bash
git add packages/ui/src/composition/stat-grid.tsx packages/ui/src/composition/stat-grid.test.tsx
git commit -m "feat(ui): StatGrid — канонический ряд KPI поверх StatCard (Фаза 3)"
```

---

## Task 3: `DetailLayout` — две колонки (main + aside) + CSS

**Files:**

- Create: `packages/ui/src/composition/detail-layout.tsx`
- Test: `packages/ui/src/composition/detail-layout.test.tsx`
- Modify: `packages/ui/src/styles/layout.ts` (добавить CSS в конец экспортируемой строки стилей)

- [x] **Step 1: Тест**

```tsx
import { describe, expect, it } from 'vitest';

import { DetailLayout } from './detail-layout.js';

describe('DetailLayout — двухколоночная раскладка карточки', () => {
  it('рендерит .ui-detail с main и aside', () => {
    const el = DetailLayout({ aside: 'ASIDE', children: 'MAIN' });
    expect(el.props.className).toBe('ui-detail');
    const [main, aside] = el.props.children as any[];
    expect(main.props.className).toBe('ui-detail__main');
    expect(main.props.children).toBe('MAIN');
    expect(aside.type).toBe('aside');
    expect(aside.props.className).toBe('ui-detail__aside');
    expect(aside.props.children).toBe('ASIDE');
  });
});
```

- [x] **Step 2: Запуск — FAIL.**

- [x] **Step 3: Реализация компонента**

```tsx
import type { PropsWithChildren, ReactElement, ReactNode } from 'react';

// Две колонки: main (секции) + aside (сводка KeyValueList/статус).
// Схлопывается в одну колонку на узких экранах (CSS .ui-detail в layout.ts).
export const DetailLayout = ({
  aside,
  children
}: PropsWithChildren<{ aside: ReactNode }>): ReactElement => (
  <div className="ui-detail">
    <div className="ui-detail__main">{children}</div>
    <aside className="ui-detail__aside">{aside}</aside>
  </div>
);
```

- [x] **Step 4: Добавить CSS** — в `packages/ui/src/styles/layout.ts` дописать в конец CSS-строки (перед закрывающим бэктиком экспортируемой константы), только токены отступов:

```css
.ui-detail {
  display: grid;
  grid-template-columns: minmax(0, 1.7fr) minmax(0, 320px);
  gap: var(--ui-space-lg);
  align-items: start;
}
.ui-detail__main,
.ui-detail__aside {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-lg);
  min-width: 0;
}
@media (max-width: 900px) {
  .ui-detail {
    grid-template-columns: 1fr;
  }
}
```

> Примечание: `320px` (ширина трека) и `900px` (breakpoint) — структурные величины, не spacing/radius; страж `token-discipline.test.ts` их не покрывает. Если внезапно покрывает — оставить `gap` на токенах и вынести литералы в комментарий-исключение по образцу существующих в `layout.ts`.

- [x] **Step 5: Запуск теста компонента — PASS**, затем страж стилей:

Run: `pnpm --filter @trudskill/ui exec vitest run src/styles/token-discipline.test.ts --no-file-parallelism`
Expected: PASS.

- [x] **Step 6: Коммит**

```bash
git add packages/ui/src/composition/detail-layout.tsx packages/ui/src/composition/detail-layout.test.tsx packages/ui/src/styles/layout.ts
git commit -m "feat(ui): DetailLayout — двухколоночная карточка (main+aside) + CSS .ui-detail (Фаза 3)"
```

---

## Task 4: `ListPage` — фильтры + AsyncSection(таблица) + пагинация

**Files:**

- Create: `packages/ui/src/composition/list-page.tsx`
- Test: `packages/ui/src/composition/list-page.test.tsx`

- [x] **Step 1: Тест**

```tsx
import { describe, expect, it } from 'vitest';

import { ListPage } from './list-page.js';
import { FilterBar } from '../components/filters/index.js';
import { AsyncSection } from './async-section.js';

interface Row {
  id: string;
  name: string;
}
const columns = [{ key: 'name' as const, title: 'Имя' }];

describe('ListPage — каркас списочного экрана', () => {
  it('оборачивает фильтры в FilterBar и тело в AsyncSection', () => {
    const el = ListPage<Row>({
      filters: 'FILTERS',
      columns,
      rows: [{ id: '1', name: 'A' }],
      isLoading: false
    });
    expect(el.props.className).toBe('ui-stack');
    const [filters, async] = el.props.children as any[];
    expect(filters.type).toBe(FilterBar);
    expect(async.type).toBe(AsyncSection);
    expect(async.props.isEmpty).toBe(false);
  });

  it('пустые rows → isEmpty=true у AsyncSection', () => {
    const el = ListPage<Row>({ columns, rows: [], isLoading: false });
    const [filters, async] = el.props.children as any[];
    expect(filters).toBeNull();
    expect(async.props.isEmpty).toBe(true);
  });

  it('пагинация рендерится только при заданных page/totalPages/onPageChange', () => {
    const el = ListPage<Row>({
      columns,
      rows: [{ id: '1', name: 'A' }],
      isLoading: false,
      page: 1,
      totalPages: 3,
      onPageChange: () => {}
    });
    const [, async] = el.props.children as any[];
    const [, pagination] = async.props.children as any[];
    expect(pagination).not.toBeNull();
    expect(pagination.props.totalPages).toBe(3);
  });
});
```

- [x] **Step 2: Запуск — FAIL.**

- [x] **Step 3: Реализация**

```tsx
import { AsyncSection } from './async-section';
import { DataTable } from '../components/table/index';
import { FilterBar } from '../components/filters/index';
import { Pagination } from '../components/pagination/index';

import type { Column } from '../components/table/index';
import type { ReactElement, ReactNode } from 'react';

export interface ListPageProps<T extends object> {
  filters?: ReactNode;
  columns: Column<T>[];
  rows: T[];
  isLoading: boolean;
  error?: unknown;
  onRetry?: () => void;
  emptyMessage?: string;
  emptyHint?: string;
  rowKey?: (row: T, index: number) => string | number;
  page?: number;
  totalPages?: number;
  onPageChange?: (next: number) => void;
}

// Каркас списочного экрана. PageHeader остаётся на уровне экрана (он во frontend).
export function ListPage<T extends object>({
  filters,
  columns,
  rows,
  isLoading,
  error,
  onRetry,
  emptyMessage,
  emptyHint,
  rowKey,
  page,
  totalPages,
  onPageChange
}: ListPageProps<T>): ReactElement {
  const showPagination =
    page !== undefined && totalPages !== undefined && onPageChange !== undefined;
  return (
    <div className="ui-stack">
      {filters ? <FilterBar>{filters}</FilterBar> : null}
      <AsyncSection
        isLoading={isLoading}
        error={error}
        isEmpty={rows.length === 0}
        {...(onRetry ? { onRetry } : {})}
        {...(emptyMessage ? { emptyMessage } : {})}
        {...(emptyHint ? { emptyHint } : {})}
      >
        <DataTable<T> columns={columns} rows={rows} {...(rowKey ? { rowKey } : {})} />
        {showPagination ? (
          <Pagination page={page} totalPages={totalPages} onPageChange={onPageChange} />
        ) : null}
      </AsyncSection>
    </div>
  );
}
```

- [x] **Step 4: Запуск — PASS.**

- [x] **Step 5: Коммит**

```bash
git add packages/ui/src/composition/list-page.tsx packages/ui/src/composition/list-page.test.tsx
git commit -m "feat(ui): ListPage — фильтры + AsyncSection(DataTable) + пагинация (Фаза 3)"
```

---

## Task 5: `Form` / `FormSection` / `FormActions` + `SelectField`

**Files:**

- Create: `packages/ui/src/composition/form.tsx`
- Create: `packages/ui/src/composition/select-field.tsx`
- Test: `packages/ui/src/composition/form.test.tsx`

- [x] **Step 1: Тест**

```tsx
import { describe, expect, it } from 'vitest';

import { Form, FormActions, FormSection } from './form.js';
import { SelectField } from './select-field.js';

describe('Form-каркасы', () => {
  it('Form → form.ui-form, className склеивается', () => {
    const el = Form({ children: 'X', className: 'extra' });
    expect(el.type).toBe('form');
    expect(el.props.className).toBe('ui-form extra');
  });

  it('FormActions → div.ui-form-actions', () => {
    expect(FormActions({ children: 'A' }).props.className).toBe('ui-form-actions');
  });

  it('FormSection → fieldset.ui-fieldset с legend при title', () => {
    const el = FormSection({ title: 'Реквизиты', children: 'B' });
    expect(el.props.className).toBe('ui-fieldset');
    const [legend] = el.props.children as any[];
    expect(legend.type).toBe('legend');
    expect(legend.props.children).toBe('Реквизиты');
  });

  it('SelectField → label.ui-field + select.ui-select + опции + ошибка', () => {
    const el = SelectField({
      label: 'Статус',
      error: 'Обязательно',
      options: [{ value: 'a', label: 'Активен' }],
      value: 'a',
      onChange: () => {}
    });
    expect(el.props.className).toBe('ui-field');
    const [labelSpan, select, , errorNode] = el.props.children as any[];
    expect(labelSpan.props.children[0]).toBe('Статус');
    expect(select.props.className).toBe('ui-select');
    expect(select.props['aria-invalid']).toBe(true);
    expect(errorNode.props.className).toBe('ui-field-error');
  });
});
```

- [x] **Step 2: Запуск — FAIL.**

- [x] **Step 3: Реализация `form.tsx`**

```tsx
import type { FormHTMLAttributes, PropsWithChildren, ReactElement } from 'react';

// Одноколоночная форма (класс ui-form, макс-ширина задаётся токеном в forms.ts).
export const Form = ({
  children,
  className,
  ...rest
}: PropsWithChildren<FormHTMLAttributes<HTMLFormElement>>): ReactElement => (
  <form className={['ui-form', className ?? ''].filter(Boolean).join(' ')} {...rest}>
    {children}
  </form>
);

export const FormSection = ({
  title,
  children
}: PropsWithChildren<{ title?: string }>): ReactElement => (
  <fieldset className="ui-fieldset">
    {title ? <legend>{title}</legend> : null}
    {children}
  </fieldset>
);

export const FormActions = ({ children }: PropsWithChildren): ReactElement => (
  <div className="ui-form-actions">{children}</div>
);
```

- [x] **Step 4: Реализация `select-field.tsx`** (зеркало `FormField` из `components/forms/index.tsx`)

```tsx
import { fieldId } from '../a11y/visually-hidden';

import type { ReactElement, ReactNode, SelectHTMLAttributes } from 'react';

export interface SelectFieldOption {
  value: string;
  label: string;
}

export const SelectField = ({
  label,
  hint,
  error,
  options,
  children,
  ...props
}: {
  label: string;
  hint?: string;
  error?: string;
  options?: SelectFieldOption[];
  children?: ReactNode;
} & SelectHTMLAttributes<HTMLSelectElement>): ReactElement => {
  const hintId = hint ? fieldId(label, 'hint') : undefined;
  const errorId = error ? fieldId(label, 'error') : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <label className="ui-field">
      <span className="ui-field-label">
        {label}
        {props.required ? ' *' : ''}
      </span>
      <select
        className="ui-select"
        aria-invalid={Boolean(error)}
        {...(describedBy ? { 'aria-describedby': describedBy } : {})}
        {...props}
      >
        {options
          ? options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))
          : children}
      </select>
      {hint ? (
        <p id={hintId} className="ui-field-hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="ui-field-error" role="alert">
          {error}
        </p>
      ) : null}
    </label>
  );
};
```

- [x] **Step 5: Запуск — PASS.**

- [x] **Step 6: Коммит**

```bash
git add packages/ui/src/composition/form.tsx packages/ui/src/composition/select-field.tsx packages/ui/src/composition/form.test.tsx
git commit -m "feat(ui): Form/FormSection/FormActions + SelectField (Фаза 3)"
```

---

## Task 6: Barrel композиции + экспорт из `@trudskill/ui` + зелёный ui-прогон

**Files:**

- Create: `packages/ui/src/composition/index.tsx`
- Modify: `packages/ui/src/index.tsx`

- [x] **Step 1: Barrel** `packages/ui/src/composition/index.tsx`

```tsx
export * from './async-section';
export * from './stat-grid';
export * from './detail-layout';
export * from './list-page';
export * from './form';
export * from './select-field';
```

- [x] **Step 2: Экспорт из корневого barrel** — в `packages/ui/src/index.tsx` дописать строку после `export * from './patterns/registry';`:

```tsx
export * from './composition/index';
```

- [x] **Step 3: Полный ui-прогон + typecheck**

Run: `pnpm --filter @trudskill/ui exec vitest run --no-file-parallelism`
Expected: PASS (существующие + 6 новых файлов).

Run: `pnpm --filter @trudskill/ui typecheck`
Expected: без ошибок.

- [x] **Step 4: Коммит**

```bash
git add packages/ui/src/composition/index.tsx packages/ui/src/index.tsx
git commit -m "feat(ui): экспорт композиционного слоя из @trudskill/ui (Фаза 3)"
```

---

## Task 7: `SectionCard` — слоты `actions` + `subtitle` (frontend)

**Files:**

- Modify: `apps/frontend/src/components/state-wrappers.tsx:32-37`
- Test: `apps/frontend/src/components/state-wrappers.test.tsx` (создать, если нет)

- [x] **Step 1: Тест**

```tsx
import { describe, expect, it } from 'vitest';

import { SectionCard } from './state-wrappers';

describe('SectionCard — заголовок со слотами', () => {
  it('без actions/subtitle: section.ui-section-card + h3.ui-section-title', () => {
    const el = SectionCard({ title: 'Список', children: 'X' });
    expect(el.props.className).toBe('ui-section-card');
  });

  it('actions рендерятся в шапке секции', () => {
    const el = SectionCard({ title: 'Список', actions: 'ACT', children: 'X' });
    // шапка = первый ребёнок; ищем переданный actions-узел где-то в дереве
    expect(JSON.stringify(el.props.children)).toContain('ACT');
  });
});
```

- [x] **Step 2: Запуск — FAIL** (если файла нет — «Cannot find module»; иначе — на `actions`).

- [x] **Step 3: Реализация** — заменить текущий `SectionCard` в `state-wrappers.tsx` на версию со слотами:

```tsx
export const SectionCard = ({
  title,
  subtitle,
  actions,
  children
}: PropsWithChildren<{ title: string; subtitle?: string; actions?: ReactNode }>) => (
  <section className="ui-section-card">
    <div className="ui-section-head">
      <div>
        <h3 className="ui-section-title">{title}</h3>
        {subtitle ? <p className="ui-page-subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="ui-inline">{actions}</div> : null}
    </div>
    {children}
  </section>
);
```

> `.ui-section-head` — новый служебный класс. Если его нет в стилях, добавить в `packages/ui/src/styles/foundation.ts` (или ближайший к `.ui-section-card`) минимально:
>
> ```css
> .ui-section-head {
>   display: flex;
>   justify-content: space-between;
>   align-items: flex-start;
>   gap: var(--ui-space-md);
> }
> ```
>
> Обратная совместимость: `title` по-прежнему обязателен, старые вызовы `SectionCard({title, children})` не ломаются.

- [x] **Step 4: Запуск — PASS**; затем полный frontend-прогон затронутого файла и typecheck ui (если менялись стили).

Run: `pnpm --filter @trudskill/frontend exec vitest run src/components/state-wrappers.test.tsx --no-file-parallelism`
Expected: PASS.

- [x] **Step 5: Коммит**

```bash
git add apps/frontend/src/components/state-wrappers.tsx apps/frontend/src/components/state-wrappers.test.tsx packages/ui/src/styles/foundation.ts
git commit -m "feat(frontend): SectionCard — слоты actions/subtitle (Фаза 3)"
```

---

## Task 8: routeMeta для `/admin/ui-kit` (frontend)

**Files:**

- Modify: `apps/frontend/src/features/navigation/model.ts` (добавить в массив `routeMeta`)
- Test: `apps/frontend/src/features/navigation/ui-kit-route.test.ts`

- [x] **Step 1: Тест**

```ts
import { describe, expect, it } from 'vitest';

import { routeMeta } from './model';

describe('routeMeta — витрина /admin/ui-kit', () => {
  it('заведена под правом администратора и не публична', () => {
    const entry = routeMeta.find((r) => r.pattern === '/admin/ui-kit');
    expect(entry).toBeDefined();
    expect(entry?.meta.public).toBe(false);
    expect(entry?.meta.requiredPermissions).toContain('auth.manage_sessions');
  });
});
```

- [x] **Step 2: Запуск — FAIL** (`entry` undefined).

Run: `pnpm --filter @trudskill/frontend exec vitest run src/features/navigation/ui-kit-route.test.ts --no-file-parallelism`

- [x] **Step 3: Реализация** — добавить запись в массив `routeMeta` (перед общей `{ pattern: '/', ... }`, рядом с прочими `/admin/*`, порядок точности соблюдён — `/admin/ui-kit` уникален):

```ts
  {
    pattern: '/admin/ui-kit',
    meta: { public: false, requiredPermissions: ['auth.manage_sessions'] }
  },
```

> В `navigationModel` НЕ добавляем — это справочная страница, не пункт меню. Инвариант «каждая nav-ссылка резолвится в routeMeta» не затрагивается.

- [x] **Step 4: Запуск — PASS.**

- [x] **Step 5: Коммит**

```bash
git add apps/frontend/src/features/navigation/model.ts apps/frontend/src/features/navigation/ui-kit-route.test.ts
git commit -m "feat(frontend): routeMeta для витрины /admin/ui-kit под правом админа (Фаза 3)"
```

---

## Task 9: Живая витрина `/admin/ui-kit` (frontend)

**Files:**

- Create: `apps/frontend/src/features/ui-kit/gallery-screen.tsx`
- Create: `apps/frontend/app/admin/ui-kit/page.tsx`

- [x] **Step 1: Экран витрины** — демонстрирует каждый каркас на фиктивных данных.

```tsx
'use client';

import {
  Button,
  DetailLayout,
  Form,
  FormActions,
  FormField,
  KeyValueList,
  ListPage,
  SelectField,
  StatGrid,
  StatusChip
} from '@trudskill/ui';
import { useState } from 'react';

import { PageContainer, PageHeader, SectionCard } from '../../components/state-wrappers';

import type { Column } from '@trudskill/ui';

interface DemoRow {
  id: string;
  name: string;
  group: string;
  status: string;
}

const DEMO_ROWS: DemoRow[] = [
  { id: '1', name: 'Иванов Иван Иванович', group: 'ПБ-07', status: 'active' },
  { id: '2', name: 'Петрова Мария Сергеевна', group: 'ОТ-12', status: 'in_progress' },
  { id: '3', name: 'Сидоров Пётр Алексеевич', group: 'ПБ-07', status: 'completed' }
];

const DEMO_COLUMNS: Column<DemoRow>[] = [
  { key: 'name', title: 'ФИО' },
  { key: 'group', title: 'Группа' },
  { key: 'status', title: 'Статус', render: (r) => <StatusChip status={r.status} /> }
];

export function UiKitGalleryScreen() {
  const [empty, setEmpty] = useState(false);

  return (
    <PageContainer>
      <PageHeader
        title="Витрина шаблонов (UI Kit)"
        subtitle="Эталонные каркасы Фазы 3 на фиктивных данных. Справочная страница для миграции экранов."
      />

      <SectionCard title="Dashboard — StatGrid">
        <StatGrid
          items={[
            { label: 'Слушателей', value: 1248 },
            { label: 'Активных групп', value: 37 },
            { label: 'Документов за месяц', value: 512, sub: '+8% к июню' }
          ]}
        />
      </SectionCard>

      <SectionCard
        title="Список — ListPage"
        actions={
          <Button variant="secondary" onClick={() => setEmpty((v) => !v)}>
            {empty ? 'Показать данные' : 'Показать пустое состояние'}
          </Button>
        }
      >
        <ListPage<DemoRow>
          columns={DEMO_COLUMNS}
          rows={empty ? [] : DEMO_ROWS}
          isLoading={false}
          emptyMessage="Записей нет"
          emptyHint="Переключите тумблер выше."
          page={1}
          totalPages={3}
          onPageChange={() => {}}
        />
      </SectionCard>

      <SectionCard title="Карточка — DetailLayout">
        <DetailLayout
          aside={
            <div className="ui-section-card">
              <h3 className="ui-section-title">Сведения</h3>
              <KeyValueList
                items={[
                  { label: 'Email', value: 'ivanov@mail.ru' },
                  { label: 'Группа', value: 'ПБ-07' },
                  { label: 'Статус', value: <StatusChip status="active" /> }
                ]}
              />
            </div>
          }
        >
          <SectionCard title="Прогресс обучения">
            <p className="ui-prose-muted">Основная колонка: секции, связанные списки, действия.</p>
          </SectionCard>
        </DetailLayout>
      </SectionCard>

      <SectionCard title="Форма — Form + FormField + SelectField">
        <Form onSubmit={(e) => e.preventDefault()}>
          <FormField label="Название" defaultValue="Пожарная безопасность" required />
          <FormField label="Код курса" defaultValue="ПБ-07" error="Код уже используется" />
          <SelectField
            label="Направление"
            defaultValue="pb"
            options={[
              { value: 'pb', label: 'Пожарная безопасность' },
              { value: 'ot', label: 'Охрана труда' }
            ]}
          />
          <FormActions>
            <Button variant="secondary" type="button">
              Отмена
            </Button>
            <Button variant="primary" type="submit">
              Сохранить
            </Button>
          </FormActions>
        </Form>
      </SectionCard>
    </PageContainer>
  );
}
```

- [x] **Step 2: Страница-роут** `apps/frontend/app/admin/ui-kit/page.tsx`

```tsx
import { UiKitGalleryScreen } from '../../../src/features/ui-kit/gallery-screen';
import { ProtectedPage } from '../../../src/widgets/shell/protected-page';

export default function UiKitPage() {
  return (
    <ProtectedPage>
      <UiKitGalleryScreen />
    </ProtectedPage>
  );
}
```

- [x] **Step 3: Проверка typecheck + сборка затронутого**

Run: `pnpm --filter @trudskill/frontend typecheck`
Expected: без ошибок. При ошибке «no exported member X» — сверить имя с barrel `@trudskill/ui`.

- [x] **Step 4: Проверка в браузере** (preview_start `frontend`, перейти на `/admin/ui-kit`, снять скриншот; см. verification workflow). Убедиться: 4 секции рендерятся, тумблер списка переключает пусто/данные, ошибка поля видна.

- [x] **Step 5: Коммит**

```bash
git add apps/frontend/src/features/ui-kit/gallery-screen.tsx apps/frontend/app/admin/ui-kit/page.tsx
git commit -m "feat(frontend): живая витрина /admin/ui-kit — все каркасы Фазы 3 (Фаза 3)"
```

---

## Task 10: Пилот СПИСОК — `learners-list-screen.tsx` на `ListPage`

**Files:**

- Modify: `apps/frontend/src/features/learners/learners-list-screen.tsx`

Цель: заменить ручной каскад `isLoading?/error?/empty?/DataTable+Pagination` внутри `SectionCard` на `ListPage`. Поведение, данные, фильтры, drawer — без изменений.

- [x] **Step 1: Заменить тело** — импорт `ListPage` из `@trudskill/ui`; заменить блок с `<FilterBar>…</FilterBar>` + `<SectionCard title="Список учеников">…каскад…</SectionCard>` на:

```tsx
<ListPage<LearnerListItem>
  filters={
    <>
      <SearchInput
        value={q}
        onChange={(v) => {
          setQ(v);
          setPage(1);
        }}
      />
      <select
        className="ui-select"
        value={status}
        onChange={(e) => {
          setStatus(e.target.value as '' | LearnerStatus);
          setPage(1);
        }}
        aria-label="Статус"
      >
        <option value="">Все статусы</option>
        <option value="active">{STATUS_LABEL.active}</option>
        <option value="archived">{STATUS_LABEL.archived}</option>
      </select>
    </>
  }
  columns={columns}
  rows={list.data?.items ?? []}
  isLoading={list.isLoading}
  error={list.error}
  onRetry={() => void list.refetch()}
  emptyMessage="Учеников нет"
  emptyHint="По текущим фильтрам ни одной записи не найдено."
  page={page}
  totalPages={totalPages}
  onPageChange={(p) => setPage(p)}
/>
```

Удалить теперь неиспользуемые импорты `FilterBar`, `DataTable`, `Pagination`, `LoadingState`, `SectionCard`, `SectionEmpty`, `SectionError` (оставить те, что ещё используются). `PageContainer`, `PageHeader`, `SearchInput`, `StatusChip`, `Column` остаются.

- [x] **Step 2: Typecheck + lint файла**

Run: `pnpm --filter @trudskill/frontend typecheck`
Run: `npx eslint apps/frontend/src/features/learners/learners-list-screen.tsx --max-warnings=0`
Expected: чисто (нет неиспользуемых импортов).

- [x] **Step 3: Проверка в браузере** — `/admin/learners`: список, фильтр, пагинация, кнопка «Редактировать» открывает drawer — как раньше.

- [x] **Step 4: Коммит**

```bash
git add apps/frontend/src/features/learners/learners-list-screen.tsx
git commit -m "refactor(frontend): пилот списка — learners на ListPage (Фаза 3)"
```

---

## Task 11: Пилот КАРТОЧКА — `client-detail-screen.tsx` на `DetailLayout`

**Files:**

- Modify: `apps/frontend/src/features/clients/client-detail-screen.tsx`

Цель: две колонки; легаси `dl.ui-data-list` → `KeyValueList`; сырая кнопка в шапке → `Button`. Данные/поведение/`ClientEditDrawer` — без изменений.

- [x] **Step 1: Заменить рендер** (после `const c = client.data;`) на:

```tsx
return (
  <PageContainer>
    <PageHeader
      title={c.name}
      subtitle={c.legalName ?? CLIENT_STATUS_LABEL[c.status]}
      actions={
        <Button variant="primary" onClick={() => setEditing(true)}>
          Редактировать
        </Button>
      }
    />

    <DetailLayout
      aside={
        <SectionCard title="Основные данные">
          <KeyValueList
            items={[
              { label: 'Код', value: c.code },
              { label: 'ИНН', value: formatInn(c.inn) },
              { label: 'КПП', value: c.kpp ?? '—' },
              { label: 'Email', value: c.contactEmail ?? '—' },
              { label: 'Телефон', value: formatPhone(c.contactPhone) },
              { label: 'Юр. адрес', value: c.legalAddress ?? '—' },
              { label: 'Заметка', value: c.note ?? '—' },
              { label: 'Статус', value: CLIENT_STATUS_LABEL[c.status] }
            ]}
          />
        </SectionCard>
      }
    >
      <GroupProgressSection clientId={c.id} />

      <SectionCard title="Связанные группы">
        <p>
          <Link href="/admin/groups">Перейти к списку групп →</Link>
        </p>
        <p className="ui-muted">
          Для привязки группы к компании откройте детали группы и выберите эту компанию в селекте
          «Компания-заказчик».
        </p>
      </SectionCard>
    </DetailLayout>

    {editing ? (
      <ClientEditDrawer
        client={c}
        onClose={() => setEditing(false)}
        onSaved={() => {
          setEditing(false);
          void client.refetch();
        }}
      />
    ) : null}
  </PageContainer>
);
```

- [x] **Step 2: Обновить импорты** — добавить `Button`, `DetailLayout`, `KeyValueList` из `@trudskill/ui`; оставить `LoadingState`. Импорты `PageContainer/PageHeader/SectionCard/SectionEmpty/SectionError` из state-wrappers остаются.

- [x] **Step 3: Typecheck + lint файла**

Run: `pnpm --filter @trudskill/frontend typecheck`
Run: `npx eslint apps/frontend/src/features/clients/client-detail-screen.tsx --max-warnings=0`
Expected: чисто.

- [x] **Step 4: Проверка в браузере** — `/admin/clients/<id>`: две колонки (слева прогресс+группы, справа сводка), кнопка «Редактировать» открывает drawer.

- [x] **Step 5: Коммит**

```bash
git add apps/frontend/src/features/clients/client-detail-screen.tsx
git commit -m "refactor(frontend): пилот карточки — client-detail на DetailLayout+KeyValueList (Фаза 3)"
```

---

## Task 12: Пилот ФОРМА — `academy/requisites/page.tsx` на `Form`/`FormField`

**Files:**

- Modify: `apps/frontend/app/academy/requisites/page.tsx`

Цель: сырые `<label><input>` → `FormField`; `<form className="ui-form" style={{maxWidth:560}}>` → `Form`; сырая кнопка → `Button` в `FormActions`. Валидация/сохранение/тост — без изменений.

- [x] **Step 1: Заменить блок `<form>…</form>`** (внутри `SectionCard`) на:

```tsx
<Form
  onSubmit={(event) => {
    event.preventDefault();
    void onSave();
  }}
>
  <FormField
    label="Юридическое название"
    value={legalName}
    onChange={(event) => setLegalName(event.target.value)}
    required
  />
  <FormField
    label="ИНН"
    value={taxNumber}
    onChange={(event) => setTaxNumber(event.target.value)}
    required
  />
  <FormField
    label="Название академии (UI)"
    value={academyName}
    onChange={(event) => setAcademyName(event.target.value)}
  />
  <FormField
    label="Часовой пояс"
    value={timezone}
    onChange={(event) => setTimezone(event.target.value)}
  />
  <FormField label="Локаль" value={locale} onChange={(event) => setLocale(event.target.value)} />
  <FormActions>
    <Button variant="primary" type="submit" loading={saving}>
      {saving ? 'Сохранение...' : 'Сохранить изменения'}
    </Button>
  </FormActions>
</Form>
```

- [x] **Step 2: Импорты** — добавить в начало файла: `import { Button, Form, FormActions, FormField } from '@trudskill/ui';`

> Инлайновый `style={{ maxWidth: 560 }}` удалён. Если `.ui-form` не ограничивает ширину, добавить в `packages/ui/src/styles/forms.ts` к правилу `.ui-form`: `max-width: 560px;` (структурный литерал, вне token-discipline). Проверить визуально.

- [x] **Step 3: Typecheck + lint файла**

Run: `pnpm --filter @trudskill/frontend typecheck`
Run: `npx eslint apps/frontend/app/academy/requisites/page.tsx --max-warnings=0`
Expected: чисто.

- [x] **Step 4: Проверка в браузере** — `/academy/requisites`: поля с метками, обязательные помечены `*`, сохранение работает, тост появляется.

- [x] **Step 5: Коммит**

```bash
git add apps/frontend/app/academy/requisites/page.tsx packages/ui/src/styles/forms.ts
git commit -m "refactor(frontend): пилот формы — academy/requisites на Form+FormField (Фаза 3)"
```

---

## Task 13: Пилот DASHBOARD — `analytics` на `StatGrid` + `AsyncSection`

**Files:**

- Modify: `apps/frontend/src/features/analytics/screens.tsx`

Цель: 6 сырых `<div className="stat-card">…</div>` → `StatGrid`/`StatCard`; подделанные `<SectionCard title="Загрузка">`/`«Ошибка»` → `AsyncSection`. Данные/фильтры/графики/таблицы — без изменений.

- [x] **Step 1: Прочитать** `AnalyticsDashboardScreen` в `apps/frontend/src/features/analytics/screens.tsx` целиком (найти KPI-полосу `.stat-grid` из сырых `.stat-card` и ветки loading/error).

- [x] **Step 2: KPI-полоса** — заменить ручную сетку из шести `<div className="stat-card"><span className="stat-card__label">…</span><span className="stat-card__value">…</span>…</div>` на один `StatGrid`:

```tsx
<StatGrid
  items={[
    { label: 'Всего слушателей', value: data.totalLearners },
    { label: 'Активных', value: data.activeLearners },
    { label: 'Завершили', value: data.completed },
    { label: 'Документов', value: data.documents },
    { label: 'Средний балл', value: data.avgScore },
    { label: 'Просрочек', value: data.overdue }
  ]}
/>
```

> Ключи/подписи взять из фактических полей (шаг 1). Форматирование значения (проценты/суффиксы) переносить в `value` как узел, `StatCard.value` принимает `ReactNode`.

- [x] **Step 3: Состояния** — заменить ветки `if (isLoading) return <SectionCard title="Загрузка">…` / `error` на обёртку `AsyncSection` вокруг тела дашборда (или ранний возврат `AsyncSection` с `children` = тело). Пример вокруг основного контента:

```tsx
<AsyncSection isLoading={query.isLoading} error={query.error} onRetry={() => void query.refetch()}>
  {/* существующие StatGrid + графики + таблицы */}
</AsyncSection>
```

- [x] **Step 4: Импорты** — добавить `AsyncSection, StatGrid` (и при необходимости убрать неиспользуемый `StatCard`/классы) из `@trudskill/ui`.

- [x] **Step 5: Typecheck + lint файла**

Run: `pnpm --filter @trudskill/frontend typecheck`
Run: `npx eslint apps/frontend/src/features/analytics/screens.tsx --max-warnings=0`
Expected: чисто.

- [x] **Step 6: Проверка в браузере** — `/admin/analytics`: KPI-полоса, графики, таблицы как раньше; при загрузке — единый `LoadingState`.

- [x] **Step 7: Коммит**

```bash
git add apps/frontend/src/features/analytics/screens.tsx
git commit -m "refactor(frontend): пилот dashboard — analytics на StatGrid+AsyncSection (Фаза 3)"
```

---

## Task 14: Финальные гейты + документация

**Files:**

- Modify: `README.md` (§2 AI Agent State)
- Modify: `LMS_AGENT_HANDOFF.md` (добавить §5.164)
- Modify: `docs/superpowers/plans/2026-07-12-ui-phase-3-reference-screens.md` (отметить чекбоксы), `docs/superpowers/specs/2026-07-12-ui-phase-3-reference-screens-design.md` (§14 отклонения)

- [x] **Step 1: Полные гейты (все зелёные)**

```bash
pnpm --filter @trudskill/ui exec vitest run --no-file-parallelism
pnpm --filter @trudskill/frontend exec vitest run --no-file-parallelism
pnpm typecheck
npx eslint "apps/frontend/src/**/*.{ts,tsx}" "packages/ui/src/**/*.{ts,tsx}" --max-warnings=0
```

Expected: все PASS / без ошибок. При падении — чинить корень, не пропускать.

- [x] **Step 2: Обновить README §2** — Current Stage / Last Completed Task / Next Task / Last Updated At / By (Фаза 3 выполнена; дальше Фаза 4 — миграция страниц пачками).

- [x] **Step 3: Добавить `### 5.164`** в `LMS_AGENT_HANDOFF.md` §5: summary (6 каркасов + витрина + 4 пилота), список файлов, тест-статус, отклонения (Drawer/Hero/DashboardTile/каталог-дедуп → Фаза 4; кросс-линк на спеку и этот план).

- [x] **Step 4: Отметить чекбоксы** в этом плане и заполнить §14 спеки фактическими отклонениями.

- [x] **Step 5: Коммит**

```bash
git add README.md LMS_AGENT_HANDOFF.md docs/superpowers/
git commit -m "docs(plan): Фаза 3 выполнена — handoff §5.164 + README §2 + чекбоксы (Фаза 3)"
```

---

## Self-Review (проведён при написании)

- **Покрытие спеки:** §4.1 Dashboard → StatGrid (Task 2) + пилот analytics (Task 13); §4.2 Список → ListPage/AsyncSection (Tasks 1,4) + пилот learners (Task 10); §4.3 Карточка две колонки → DetailLayout (Task 3) + пилот clients (Task 11); §4.4 Форма → Form/FormField/SelectField (Task 5) + пилот academy (Task 12); §6 обёртки → SectionCard слоты (Task 7); §7 витрина → Task 9 (+ routeMeta Task 8); §10 гейты → Task 14. **Сужения по YAGNI зафиксированы в шапке** (Drawer/Hero/DashboardTile/каталог-дедуп/PageContainer-dedup → Фаза 4).
- **Плейсхолдеры:** реальный код в каждом шаге создания компонентов; пилоты — целевой код или точный трансформ (Task 13 — read-first, т.к. файл большой; трансформы конкретны).
- **Согласованность имён:** `AsyncSection`, `StatGrid`, `DetailLayout` (+`__main`/`__aside`), `ListPage`, `Form`/`FormSection`/`FormActions`, `SelectField` — совпадают между определением (Tasks 1-5), barrel (Task 6) и использованием (Tasks 9-13). Классы: `.ui-detail*` (новый), остальные существующие (проверены грепом `styles/*`).
- **Контракт данных:** `ListPage`/`AsyncSection` принимают нормализованные пропсы (`rows/isLoading/error`), адаптация React-Query/useState — на стороне экрана (пилоты показывают оба: learners=`list.data?.items`, analytics=`query`).
