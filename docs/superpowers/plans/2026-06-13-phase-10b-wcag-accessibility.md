# Phase 10 Track B — WCAG accessibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Поднять базовую WCAG-доступность общих UI-примитивов CDOProf и закрепить её **статическим гейтом** `eslint-plugin-jsx-a11y` (под конвенцию репо «no React mount / no axe runtime»). Конкретно: чинит примитивы с реальными пробелами (StatusChip полагается на цвет; LoadingState без `role="status"`; SearchInput/LookupSelect без label; Pagination без aria/landmark; FilterBar без группировки; FormField не связан с error/hint через `aria-describedby`; AppShell-бейдж непрочитанных без `aria-live`; DataTable — нестабильные ключи строк), и не трогает уже сильные landmarks (Modal, AppShell skip-link/`<nav>`/`<header>`/`<aside>`).

**Scope source:** `docs/superpowers/specs/2026-06-13-phase-10a-excel-report-builder-design.md` §11 (Track B bullet) — утверждённый скоуп.

**Architecture / approach:**

- **Единый статический гейт.** В репо ОДИН корневой flat-config `eslint.config.mjs` (ESLint 9), который покрывает и `apps/frontend`, и `packages/ui` (per-package `pnpm lint` → `next lint` для фронта, `eslint src` для ui — оба резолвят корневой flat-config). Поэтому `eslint-plugin-jsx-a11y` подключается ОДНИМ новым flat-config-блоком, заскоупленным на `**/*.{jsx,tsx}` фронта+ui. Это покрывает все примитивы, не дублируя конфиг.
- **Без runtime-доступности.** Никаких `render()`/RTL/axe — в репо нет DOM-окружения в тестах (CLAUDE.md: «E2E» = permission/routing/dynamic-import smoke). Runtime axe-аудит **явно отложен** (зафиксировано в спеке §11 и в handoff). Автоматический сигнал доступности = lint с новым плагином (статический). Чисто-функциональная логика (`visuallyHidden`-класс/утилита, генератор id для label-связки, текст-маппинг StatusChip) покрывается обычными vitest-юнитами.
- **Стратегия конфига плагина (D-B1):** включаем `jsxA11y.flatConfigs.recommended` (а НЕ `strict`) и **чиним нарушения**, которые он вскрывает в целевых примитивах, вместо отключения правил. Чтобы плагин не дал «стену» pre-existing падений на несвязанном коде: (1) `recommended` сам по себе консервативен; (2) ПЕРВАЯ же задача после установки прогоняет `pnpm lint` и фиксирует фактический список нарушений — если всплывут НЕ-целевые файлы вне нашего скоупа фиксов, для них точечно ставим `'warn'` ИЛИ `// eslint-disable-next-line` с TODO-ссылкой на этот план (НЕ глобально выключаем правило). Цель — `--max-warnings=0` зелёный на `packages/ui` и `apps/frontend` после всех фиксов.

**Label-паттерн (D-B2):** для контролов без видимого текстового label (SearchInput, LookupSelect) используем **видимый-через-`.ui-visually-hidden` `<label>` + сгенерированный `htmlFor`/`id`** как ЕДИНЫЙ консистентный паттерн (НЕ голый `aria-label`), потому что: (а) `<label>`-ассоциация надёжнее для скринридеров и расширяет кликабельную зону; (б) `jsx-a11y/label-has-associated-control` останется довольным; (в) опциональный проп `label` со значением по умолчанию сохраняет обратную совместимость вызовов. Добавляем `.ui-visually-hidden` в общий CSS пакета `ui` и экспортируем хелпер.

**Ключевые конвенции репо (обязательно к соблюдению):**

- Frontend-тесты НЕ используют React Testing Library / `render()`. «E2E» в `apps/frontend/src/e2e/*.e2e.test.ts` — только `evaluateRouteAccess` / `getVisibleNavigation` / чистые пайплайны / dynamic-import smoke.
- `exactOptionalPropertyTypes: true` — `{ label?: string }` НЕ принимает `{ label: undefined }`; используем conditional spread.
- Навигация — данные в `features/navigation/model.ts` (в этом плане навигацию НЕ трогаем — новых страниц нет).
- Запуск одного файла тестов: `pnpm --filter @cdoprof/ui exec vitest run src/<path>.test.ts --no-file-parallelism` (то же для frontend).
- Линт одного файла: `npx eslint <path> --max-warnings=0`.
- Коммиты — Conventional Commits; pre-push гоняет `pnpm typecheck` по всему монорепо.
- `packages/ui` экспортирует примитивы через entrypoint `@cdoprof/ui` (`packages/ui/src/index.ts` — сверить, что новые экспорты добавлены туда же, если введём утилиту).

**Порядок задач:** сначала ставим+конфигурируем гейт (Task 1–2, чтобы последующие фиксы были guided плагином), затем фиксы примитивов сгруппированно (Task 3–8), затем shell/form-wiring (Task 9–10), затем финальная верификация (Task 11) и документация (Task 12).

---

### Task 1: Установка + конфигурация `eslint-plugin-jsx-a11y` (статический гейт)

**Files:**

- Modify: `package.json` (root devDeps: `eslint-plugin-jsx-a11y`)
- Modify: `eslint.config.mjs` (новый flat-config-блок для frontend+ui jsx/tsx)
- Modify: `apps/frontend/.eslintrc.json` (next lint shim — добавить плагин в extends для совместимости с `next lint`)

- [ ] **Step 1: Установить плагин**

```bash
pnpm add -D -w eslint-plugin-jsx-a11y
```

- [ ] **Step 2: Подключить в корневой flat-config.** В `eslint.config.mjs` импортировать плагин и добавить НОВЫЙ блок ПОСЛЕ next-блока и ПЕРЕД `prettier` (порядок важен: prettier должен оставаться последним). Заскоупить на jsx/tsx фронта и ui:

```js
import jsxA11y from 'eslint-plugin-jsx-a11y';
// ...
  {
    // Phase 10 Track B — статический WCAG-гейт для общих примитивов и экранов.
    // Покрывает и packages/ui, и apps/frontend (оба резолвят этот корневой flat-config).
    files: ['apps/frontend/**/*.{jsx,tsx}', 'packages/ui/**/*.{jsx,tsx}'],
    ...jsxA11y.flatConfigs.recommended
  },
```

(Замечание: `jsxA11y.flatConfigs.recommended` сам тянет `plugins` + `rules` + `languageOptions.parserOptions.ecmaFeatures.jsx`. Если в этом блоке нужно переопределить `parser` под TS — добавить `languageOptions: { parser, parserOptions: { ... } }` рядом, как в основном блоке.)

- [ ] **Step 3: Совместимость с `next lint`.** `apps/frontend` линтуется через `next lint`, который читает `apps/frontend/.eslintrc.json` (legacy-формат). Чтобы статический гейт работал и в `next lint`, расширить shim:

```json
{
  "extends": ["next/core-web-vitals", "plugin:jsx-a11y/recommended"]
}
```

- [ ] **Step 4: Зафиксировать baseline нарушений (НЕ чинить здесь).** Прогнать полный линт и ЗАПИСАТЬ список:

```bash
pnpm lint 2>&1 | tee /tmp/a11y-baseline.txt   # или PowerShell: pnpm lint *> a11y-baseline.txt
```

Цель шага — увидеть, какие правила и файлы вскрылись. Ожидаемые целевые нарушения (будут чиниться в Task 3–10): `label-has-associated-control` (SearchInput/LookupSelect), возможно `no-static-element-interactions`/`click-events-have-key-events` где-то в экранах. **Если всплыли НЕ-целевые файлы вне нашего скоупа** (большой объём pre-existing) — в Task 2 для них точечно понижаем правило до `'warn'` или ставим `// eslint-disable-next-line jsx-a11y/<rule> -- TODO Phase 10B follow-up` со ссылкой; НЕ выключаем правило глобально. Записать вывод в описание коммита/handoff.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml eslint.config.mjs apps/frontend/.eslintrc.json
git commit -m "chore(tooling): wire eslint-plugin-jsx-a11y recommended as static a11y gate (frontend + ui)"
```

---

### Task 2: Триаж baseline — не дать гейту блокировать несвязанную работу

**Files:**

- Modify: `eslint.config.mjs` (только если baseline вскрыл не-целевые pre-existing нарушения)

- [ ] **Step 1: Разобрать `/tmp/a11y-baseline.txt`.** Разделить нарушения на две группы: **(A) целевые** (в примитивах из этого плана — чиним в Task 3–10) и **(B) не-целевые** (pre-existing в экранах/виджетах, вне скоупа фиксов).
- [ ] **Step 2: Для группы (B)** — НЕ выключать правило глобально. Выбрать минимально-инвазивный из двух:
  - инлайн `// eslint-disable-next-line jsx-a11y/<rule> -- Phase 10B: out-of-scope, follow-up` рядом с конкретной строкой (предпочтительно — точечно и видимо);
  - ИЛИ, если таких мест много в одном файле/паттерне, добавить узкий flat-config override со `'warn'` для конкретного правила на конкретном glob (например `apps/frontend/app/**/page.tsx`), с комментарием-TODO.
- [ ] **Step 3:** Если группа (B) ПУСТА (recommended оказался чистым вне примитивов) — этот таск no-op, отметить в handoff «baseline clean, без override» и пропустить коммит.
- [ ] **Step 4: Проверка** — `pnpm lint` теперь падает ТОЛЬКО на целевых примитивах (которые починим дальше) либо чисто (если их ещё не трогали — они могут не давать ошибок recommended, тогда фиксы Task 3–10 — это семантические улучшения сверх плагина, а не lint-fix).
- [ ] **Step 5: Commit (если были изменения)**

```bash
git add eslint.config.mjs
git commit -m "chore(tooling): scope-limit a11y gate for pre-existing out-of-scope violations (Phase 10B)"
```

**Acceptance (Task 1–2):** `eslint-plugin-jsx-a11y` установлен и подключён в корневой flat-config + next-shim; `pnpm lint` не выдаёт «стену» pre-existing падений на несвязанном коде (группа B нейтрализована точечно/`warn` с TODO, без глобального отключения правил); baseline зафиксирован для handoff.

---

### Task 3: `.ui-visually-hidden` утилита + хелпер генерации id (TDD-юнит)

**Files:**

- Create: `packages/ui/src/a11y/visually-hidden.ts` (хелпер id + ре-экспорт класс-имени)
- Create: `packages/ui/src/a11y/visually-hidden.test.ts`
- Modify: глобальный CSS пакета `ui` (найти через `Glob packages/ui/src/**/*.css` — добавить класс `.ui-visually-hidden`)
- Modify: `packages/ui/src/index.ts` (экспорт хелпера, если барель есть — сверить)

- [ ] **Step 1: Failing test** для генератора стабильного id и константы класса:

```ts
import { describe, expect, it } from 'vitest';

import { VISUALLY_HIDDEN_CLASS, fieldId } from './visually-hidden.js';

describe('a11y helpers', () => {
  it('VISUALLY_HIDDEN_CLASS — стабильное имя класса', () => {
    expect(VISUALLY_HIDDEN_CLASS).toBe('ui-visually-hidden');
  });
  it('fieldId детерминирован по (base, suffix)', () => {
    expect(fieldId('search', 'label')).toBe('search-label');
    expect(fieldId('lookup-status', 'input')).toBe('lookup-status-input');
  });
  it('fieldId санитизирует пробелы/спецсимволы в стабильный slug', () => {
    expect(fieldId('Поиск по ФИО', 'label')).toMatch(/^[a-z0-9-]+-label$/);
  });
});
```

- [ ] **Step 2: Run** → FAIL (модуля нет).

```bash
pnpm --filter @cdoprof/ui exec vitest run src/a11y/visually-hidden.test.ts --no-file-parallelism
```

- [ ] **Step 3: Реализация** `visually-hidden.ts`:

```ts
/** Класс для визуально-скрытого, но доступного скринридеру текста (label-ассоциация). */
export const VISUALLY_HIDDEN_CLASS = 'ui-visually-hidden';

/** Детерминированный id для связки label↔input/hint/error. */
export function fieldId(base: string, suffix: 'label' | 'input' | 'hint' | 'error'): string {
  const slug =
    base
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'field';
  return `${slug}-${suffix}`;
}
```

- [ ] **Step 4: CSS-класс.** В глобальном CSS пакета `ui` (найти существующий файл со стилями `.ui-*`) добавить стандартный visually-hidden-сниппет:

```css
.ui-visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

- [ ] **Step 5: Run tests** → PASS; `npx eslint packages/ui/src/a11y/visually-hidden.ts --max-warnings=0` чисто.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/a11y/ packages/ui/src/index.ts
git commit -m "feat(ui): visually-hidden a11y class + deterministic fieldId helper (label association)"
```

**Acceptance:** юниты `visually-hidden.test.ts` зелёные; класс `.ui-visually-hidden` в CSS пакета; хелпер экспортируется из `@cdoprof/ui`.

---

### Task 4: StatusChip — не полагаться на цвет (TDD-юнит маппинга)

**Files:**

- Create: `packages/ui/src/components/badges/status-label.ts` (чистый маппинг статус→рус. текст)
- Create: `packages/ui/src/components/badges/status-label.test.ts`
- Modify: `packages/ui/src/components/badges/index.tsx`

- [ ] **Step 1: Failing test** для текст-маппинга (источник доступного label, чтобы не было color-only):

```ts
import { describe, expect, it } from 'vitest';

import { statusAccessibleLabel } from './status-label.js';

describe('statusAccessibleLabel', () => {
  it('известные статусы → человекочитаемый текст', () => {
    expect(statusAccessibleLabel('active')).toBeTruthy();
    expect(statusAccessibleLabel('inactive')).toBeTruthy();
  });
  it('неизвестный статус → сам статус как fallback', () => {
    expect(statusAccessibleLabel('weird_status')).toBe('weird_status');
  });
});
```

- [ ] **Step 2: Run** → FAIL.

- [ ] **Step 3: Реализация** `status-label.ts` — маппинг известных `EntityStatus` на рус. подписи (свериться со значениями `EntityStatus` в `@cdoprof/shared-types`), fallback = сам ключ.

- [ ] **Step 4: Фикс `badges/index.tsx`** — добавить НЕ-цветовой носитель смысла: видимый текст уже есть (`{label ?? status}`), но цвет-фон единственный различитель состояния. Добавить `role="status"`-нейтрально НЕ нужно; нужно `aria-label`/`title`, гарантирующий смысл независимо от цвета, и НЕ полагаться на фон:

```tsx
export const StatusChip = ({
  status,
  label
}: {
  status: EntityStatus | string;
  label?: string;
}): ReactElement => {
  const text = label ?? statusAccessibleLabel(status);
  return (
    <span
      className="ui-badge"
      title={text}
      style={{
        background:
          semanticStatusMap[(status as keyof typeof semanticStatusMap) ?? 'inactive'] ??
          'var(--ui-neutral-500)'
      }}
    >
      {text}
    </span>
  );
};
```

(Текст внутри чипа уже несёт смысл без цвета — это и есть фикс 1.4.1. `title` добавляет hover-подсказку. Если в будущем чип станет иконочным/цветным-без-текста — `aria-label` обязателен; здесь текст присутствует, поэтому достаточно гарантировать осмысленный `text` через маппинг.)

- [ ] **Step 5: Run tests + lint** → PASS, `npx eslint packages/ui/src/components/badges/ --max-warnings=0` чисто.

- [ ] **Step 6: Commit**

```bash
git add packages/ui/src/components/badges/
git commit -m "feat(ui): StatusChip carries text+title (not color-only) via status label map (WCAG 1.4.1)"
```

**Acceptance:** `status-label.test.ts` зелёный; StatusChip всегда рендерит осмысленный текст + `title`; lint чист.

---

### Task 5: LoadingState / states — `role="status"` + `aria-live` + EmptyState семантика

**Files:**

- Modify: `packages/ui/src/components/states/index.tsx`

- [ ] **Step 1: Фикс `LoadingState`** — добавить live-region семантику:

```tsx
export const LoadingState = ({ message = 'Loading...' }: { message?: string }): ReactElement => (
  <div className="ui-loading" role="status" aria-live="polite" aria-busy="true">
    {message}
  </div>
);
```

- [ ] **Step 2: EmptyState** — оставить визуал, но дать `role="status"` (не alert — это не ошибка), чтобы динамическое появление «нет данных» озвучивалось:

```tsx
export const EmptyState = ({
  message = 'No data yet',
  hint
}: {
  message?: string;
  hint?: string;
}): ReactElement => (
  <div className="ui-empty" role="status">
    {message}
    {hint ? <p className="ui-empty-hint">{hint}</p> : null}
  </div>
);
```

(ErrorState уже имеет `role="alert"` — НЕ трогать.)

- [ ] **Step 3: Проверка** — `pnpm --filter @cdoprof/ui exec vitest run --no-file-parallelism` (если есть тесты states) + `npx eslint packages/ui/src/components/states/ --max-warnings=0` + `pnpm typecheck`. Чистая правка разметки, юнита на DOM нет (конвенция). Acceptance — lint+typecheck зелёные.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/components/states/
git commit -m "feat(ui): LoadingState role=status/aria-live/aria-busy + EmptyState role=status"
```

**Acceptance:** LoadingState озвучивается скринридером (`role="status"` + `aria-live="polite"` + `aria-busy`); EmptyState — `role="status"`; lint + typecheck зелёные.

---

### Task 6: SearchInput + LookupSelect — label-ассоциация (единый паттерн)

**Files:**

- Modify: `packages/ui/src/components/search/index.tsx`
- Modify: `packages/ui/src/components/select/index.tsx`

- [ ] **Step 1: SearchInput** — добавить опциональный `label` (default «Поиск») через `.ui-visually-hidden`-`<label>` + связку id (паттерн D-B2). `exactOptionalPropertyTypes` — `label` со значением по умолчанию, без `undefined`-присвоений:

```tsx
import { VISUALLY_HIDDEN_CLASS, fieldId } from '../../a11y/visually-hidden.js';

import type { ReactElement } from 'react';

export const SearchInput = ({
  value,
  onChange,
  label = 'Поиск',
  placeholder = 'Поиск'
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
}): ReactElement => {
  const id = fieldId(label, 'input');
  return (
    <>
      <label className={VISUALLY_HIDDEN_CLASS} htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="ui-input"
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </>
  );
};
```

- [ ] **Step 2: LookupSelect** — тот же паттерн (опциональный `label`, default разумный, например «Выбор»):

```tsx
import { VISUALLY_HIDDEN_CLASS, fieldId } from '../../a11y/visually-hidden.js';

export const LookupSelect = ({
  items,
  value,
  onChange,
  label = 'Выбор значения'
}: {
  items: LookupItem[];
  value?: string;
  onChange: (value: string) => void;
  label?: string;
}): ReactElement => {
  const id = fieldId(label, 'input');
  return (
    <>
      <label className={VISUALLY_HIDDEN_CLASS} htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className="ui-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {items.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
    </>
  );
};
```

(Замечание для исполнителя: проверить существующие вызовы `SearchInput`/`LookupSelect` по фронту — `Grep SearchInput`/`LookupSelect`. Новые пропсы опциональны → вызовы не ломаются; но где есть осмысленный контекст, рекомендовать передать `label`.)

- [ ] **Step 3: Проверка** — `npx eslint packages/ui/src/components/search/ packages/ui/src/components/select/ --max-warnings=0` (`jsx-a11y/label-has-associated-control` теперь доволен) + `pnpm typecheck`.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/components/search/ packages/ui/src/components/select/
git commit -m "feat(ui): SearchInput + LookupSelect visually-hidden label association (consistent pattern)"
```

**Acceptance:** оба контрола имеют связанный `<label>` (через `htmlFor`/`id`); `jsx-a11y/label-has-associated-control` зелёный; typecheck зелёный; существующие вызовы не сломаны.

---

### Task 7: Pagination — `<nav aria-label>` + aria на кнопках + aria-live индикатор

**Files:**

- Modify: `packages/ui/src/components/pagination/index.tsx`

- [ ] **Step 1: Фикс** — обернуть в `<nav aria-label>`, добавить `type="button"` + `aria-label` на prev/next, индикатор страницы — `aria-live="polite"`:

```tsx
export const Pagination = ({
  page,
  totalPages,
  onPageChange,
  label = 'Постраничная навигация'
}: {
  page: number;
  totalPages: number;
  onPageChange: (next: number) => void;
  label?: string;
}): ReactElement => (
  <nav className="ui-inline" aria-label={label}>
    <button
      type="button"
      disabled={page <= 1}
      aria-label="Предыдущая страница"
      onClick={() => onPageChange(page - 1)}
    >
      Prev
    </button>
    <span aria-live="polite">
      {page} / {totalPages}
    </span>
    <button
      type="button"
      disabled={page >= totalPages}
      aria-label="Следующая страница"
      onClick={() => onPageChange(page + 1)}
    >
      Next
    </button>
  </nav>
);
```

- [ ] **Step 2: Проверка** — `npx eslint packages/ui/src/components/pagination/ --max-warnings=0` + `pnpm typecheck`.

- [ ] **Step 3: Commit**

```bash
git add packages/ui/src/components/pagination/
git commit -m "feat(ui): Pagination nav landmark + aria-labels on prev/next + aria-live page indicator"
```

**Acceptance:** Pagination — `<nav aria-label>`-landmark; prev/next имеют `type="button"` + `aria-label`; смена страницы озвучивается; lint+typecheck зелёные.

---

### Task 8: FilterBar — групповая семантика + DataTable стабильные ключи строк

**Files:**

- Modify: `packages/ui/src/components/filters/index.tsx`
- Modify: `packages/ui/src/components/table/index.tsx`

- [ ] **Step 1: FilterBar** — дать группе доступное имя (`role="group"` + `aria-label`), опциональный проп:

```tsx
import type { PropsWithChildren, ReactElement } from 'react';

export const FilterBar = ({
  children,
  label = 'Фильтры'
}: PropsWithChildren<{ label?: string }>): ReactElement => (
  <div className="ui-filter-bar" role="group" aria-label={label}>
    {children}
  </div>
);
```

- [ ] **Step 2: DataTable стабильные ключи строк.** Сейчас `rows.map((r, i) => <tr key={i}>)` — нестабильно при сортировке/фильтрации (React reconciliation + a11y focus drift). Ввести устойчивый ключ: добавить опциональный проп `rowKey?: (row: T, index: number) => string | number` с дефолтом, который пытается взять `r.id`/`r.key`, иначе индекс:

```tsx
export function DataTable<T extends object>({
  columns,
  rows,
  stickyFirstColumn = false,
  sortBy,
  sortDir = 'asc',
  onSort,
  emptyMessage = 'Нет данных',
  rowKey
}: {
  columns: Column<T>[];
  rows: T[];
  stickyFirstColumn?: boolean;
  sortBy?: keyof T;
  sortDir?: 'asc' | 'desc';
  onSort?: (next: { key: keyof T; dir: 'asc' | 'desc' }) => void;
  emptyMessage?: string;
  /** Стабильный ключ строки; по умолчанию r.id/r.key, иначе индекс (fallback). */
  rowKey?: (row: T, index: number) => string | number;
}): ReactElement {
  const resolveRowKey = (row: T, index: number): string | number => {
    if (rowKey) return rowKey(row, index);
    const candidate = (row as Record<string, unknown>).id ?? (row as Record<string, unknown>).key;
    return typeof candidate === 'string' || typeof candidate === 'number' ? candidate : index;
  };
  // ...
  // в tbody:
  rows.map((r, i) => (
    <tr key={resolveRowKey(r, i)}>
      {/* ... */}
    </tr>
  ))
```

(Колоночные `key={String(c.key)}` уже стабильны — не трогать. Реализация должна сохранить existing поведение для строк без id — fallback на индекс.)

- [ ] **Step 3: Проверка** — `npx eslint packages/ui/src/components/filters/ packages/ui/src/components/table/ --max-warnings=0` + `pnpm typecheck` + прогон существующих ui-тестов, если затрагивают DataTable (`Glob packages/ui/src/**/table*.test.ts`).

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/components/filters/ packages/ui/src/components/table/
git commit -m "feat(ui): FilterBar group/aria-label + DataTable stable row keys (rowKey prop, id fallback)"
```

**Acceptance:** FilterBar — `role="group"` с доступным именем; DataTable использует стабильный ключ строки (id/key → fallback index); lint+typecheck зелёные; существующие вызовы DataTable не сломаны (новый проп опционален).

---

### Task 9: FormField / TextareaField — связка с error/hint через `aria-describedby`

**Files:**

- Modify: `packages/ui/src/components/forms/index.tsx`

- [ ] **Step 1: Фикс `FormField`** — сейчас error/hint визуально есть, но НЕ связаны с input через `aria-describedby`, поэтому скринридер их не озвучивает. Сгенерировать id для hint/error и связать:

```tsx
import { fieldId } from '../../a11y/visually-hidden.js';

import type { InputHTMLAttributes, ReactElement, TextareaHTMLAttributes } from 'react';

interface BaseFieldProps {
  label: string;
  hint?: string;
  error?: string;
}

export const FormField = ({
  label,
  hint,
  error,
  ...props
}: BaseFieldProps & InputHTMLAttributes<HTMLInputElement>): ReactElement => {
  const hintId = hint ? fieldId(label, 'hint') : undefined;
  const errorId = error ? fieldId(label, 'error') : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;
  return (
    <label className="ui-field">
      <span className="ui-field-label">
        {label}
        {props.required ? ' *' : ''}
      </span>
      <input
        className="ui-input"
        aria-invalid={Boolean(error)}
        {...(describedBy ? { 'aria-describedby': describedBy } : {})}
        {...props}
      />
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

(`exactOptionalPropertyTypes`: `aria-describedby` подмешиваем conditional spread, НЕ `aria-describedby={undefined}`. Добавить `role="alert"` на error-`<p>` для озвучивания при появлении.)

- [ ] **Step 2: TextareaField** — та же связка для `<textarea>` (id hint/error + `aria-describedby` conditional spread + `role="alert"` на error).

- [ ] **Step 3: Проверка** — `npx eslint packages/ui/src/components/forms/ --max-warnings=0` + `pnpm typecheck`.

- [ ] **Step 4: Commit**

```bash
git add packages/ui/src/components/forms/
git commit -m "feat(ui): FormField/TextareaField wire hint+error via aria-describedby + role=alert"
```

**Acceptance:** input/textarea связаны с hint/error через `aria-describedby` (conditional spread, без `undefined`); error озвучивается (`role="alert"`); lint+typecheck зелёные.

---

### Task 10: AppShell — `aria-live` на бейдже непрочитанных уведомлений

**Files:**

- Modify: `apps/frontend/src/widgets/shell/app-shell.tsx`

- [ ] **Step 1: Найти бейдж непрочитанных.** `Grep` по `app-shell.tsx` на `aria-label` рядом со счётчиком уведомлений (бейдж уже имеет `aria-label`, но НЕ `aria-live` — динамическое изменение счётчика не озвучивается). Обернуть/пометить контейнер счётчика `aria-live="polite"` (и при наличии — `role="status"`), сохранив существующий `aria-label`. Точная разметка — по факту в файле; НЕ переписывать остальные части shell (skip-link, `<nav>`, `<header>`, `<aside>`, `aria-current` — уже хорошие, не трогать).

```tsx
// пример формы (адаптировать под фактическую разметку бейджа):
<span className="..." role="status" aria-live="polite" aria-label={`Непрочитанных: ${unreadCount}`}>
  {unreadCount > 0 ? unreadCount : null}
</span>
```

- [ ] **Step 2: Проверка** — `npx eslint apps/frontend/src/widgets/shell/app-shell.tsx --max-warnings=0` + `pnpm typecheck`. Существующие shell e2e (`Glob apps/frontend/src/e2e/*shell*`/`*navigation*`) должны остаться зелёными — изменение чисто атрибутивное.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/widgets/shell/app-shell.tsx
git commit -m "feat(frontend): AppShell unread-notifications badge aria-live (dynamic count announced)"
```

**Acceptance:** изменение счётчика непрочитанных озвучивается (`aria-live="polite"`); остальные landmarks shell не тронуты; lint+typecheck+существующие e2e зелёные.

---

### Task 11: Финальная верификация (полный lint + typecheck + e2e smoke)

**Files:** —

- [ ] **Step 1: Полный frontend-набор** (на этой машине работает):

```bash
pnpm test:frontend
```

Expected: PASS — существующие e2e (permission/routing/dynamic-import) зелёные; примитивы не имели DOM-тестов (конвенция), их фиксы не ломают пайплайны.

- [ ] **Step 2: UI-пакет тесты** (новые юниты + existing):

```bash
pnpm --filter @cdoprof/ui exec vitest run --no-file-parallelism
```

Expected: PASS (`visually-hidden.test.ts`, `status-label.test.ts` + любые existing ui-тесты).

- [ ] **Step 3: Полный lint** — статический a11y-гейт зелёный по фронту и ui:

```bash
pnpm lint
```

Expected: PASS, `--max-warnings=0`. Все целевые примитивы чисты; группа (B) (если была) нейтрализована в Task 2.

- [ ] **Step 4: Typecheck монорепо** — `pnpm typecheck` → 8/8 PASS.

- [ ] **Step 5:** При желании — `npx eslint packages/ui/src --max-warnings=0` и `cd apps/frontend && pnpm lint` отдельно, чтобы подтвердить, что плагин активен в ОБОИХ путях линтования (`eslint src` для ui и `next lint` для фронта).

**Acceptance (главный зелёный сигнал плана):** `pnpm lint` (с активным `eslint-plugin-jsx-a11y/recommended`) — PASS `--max-warnings=0`; целевые юниты (`visually-hidden`, `status-label`) — PASS; `pnpm typecheck` — 8/8; `pnpm test:frontend` — все existing e2e зелёные. Runtime axe — ЯВНО отложен (вне скоупа, нет DOM-окружения).

---

### Task 12: Документация и закрытие сессии

**Files:**

- Modify: `README.md` §2 «AI Agent State» (Current Stage / Last Completed / Current / Next / Last Updated At / By)
- Modify: `LMS_AGENT_HANDOFF.md` — добавить `### 5.122` (следующий номер после 5.121): summary, файлы, тестовый статус, отклонения (включая baseline-триаж из Task 2, выбор label-паттерна, отложенный runtime axe)
- Modify: `docs/superpowers/plans/2026-06-13-phase-10b-wcag-accessibility.md` — проставить `- [x]` выполненным шагам
- Modify: `docs/superpowers/PLANS_STATUS.md` — строка Phase 10 Track B со статусом и PR (формат — по соседним строкам)

- [ ] **Step 1: Внести правки во все файлы выше.** В handoff §5.122 зафиксировать: (а) гейт = `jsx-a11y/recommended` (НЕ strict), wired в корневой flat-config + next-shim; (б) label-паттерн = visually-hidden `<label>` + `fieldId`; (в) baseline-триаж результат (была/не было группы B); (г) runtime axe отложен; (д) landmarks Modal/AppShell не трогались (уже сильные).
- [ ] **Step 2: Commit**

```bash
git add README.md LMS_AGENT_HANDOFF.md docs/
git commit -m "docs: Phase 10 Track B handoff 5.122 + README s2 + plan checkboxes + PLANS_STATUS"
```

**Acceptance:** README §2 обновлён; handoff §5.122 добавлен; план отмечен; PLANS_STATUS-строка добавлена.

---

## Open questions (с рекомендованными дефолтами — не блокируют)

1. **Label-паттерн для безлейбловых контролов** — `aria-label` vs visually-hidden `<label>`?
   **Рекомендованный дефолт (принят в плане, D-B2): visually-hidden `<label>` + `htmlFor`/`id`** через `.ui-visually-hidden` + `fieldId`. Надёжнее для скринридеров, расширяет клик-зону, удовлетворяет `jsx-a11y/label-has-associated-control`. Применяется ко ВСЕМ безлейбловым контролам единообразно.

2. **Объём pre-existing нарушений вне примитивов (группа B)** — насколько `recommended` «шумит» на существующих экранах?
   **Рекомендованный дефолт: сначала включить `recommended` и измерить (Task 1 Step 4).** Если шум большой — точечные инлайн-`eslint-disable-next-line ... -- Phase 10B follow-up` или узкий `'warn'`-override на конкретный glob (Task 2), НИКОГДА не глобальное выключение правила. Это держит гейт включённым и не блокирует несвязанную работу.

3. **EmptyState role** — `role="status"` vs без роли?
   **Рекомендованный дефолт: `role="status"`** (мягкое озвучивание появления «нет данных», не `alert` — это не ошибка). Если в каком-то контексте это создаёт лишний шум, вызывающий код может не использовать EmptyState для не-динамических пустых состояний.

4. **`packages/ui` CSS-файл для `.ui-visually-hidden`** — точный путь определяется по факту (`Glob packages/ui/src/**/*.css`); если в `ui` стили инлайнятся, а не в `.css`, добавить класс туда, где живут прочие `.ui-*`-классы (или в общий стайл-энтрипоинт фронта, если `ui` стили там агрегируются). **Дефолт: класс рядом с существующими `.ui-badge`/`.ui-input`-определениями.**

---

## Self-review (выполнен при написании плана)

- **Покрытие спеки §11 Track B:** статический гейт `eslint-plugin-jsx-a11y` → Task 1–2; ручные фиксы примитивов — StatusChip (Task 4), LoadingState (Task 5), SearchInput/LookupSelect label (Task 6), Pagination (Task 7), FilterBar + DataTable keys (Task 8), FormField↔error/hint (Task 9), AppShell badge aria-live (Task 10); runtime axe — ЯВНО отложен (Task 11 Acceptance). Modal/AppShell landmarks — НЕ трогаются (уже сильные, подтверждено surface-map'ом).
- **Конвенции:** ни одного `render()`/RTL-теста; автоматический сигнал = lint (статика); чистая логика (`visually-hidden`, `status-label`) — обычные vitest-юниты. `exactOptionalPropertyTypes` соблюдён (conditional spread для `aria-describedby`, опциональные `label` с дефолтами без `undefined`).
- **Точки верификации исполнителем в живом коде** (не плейсхолдеры): фактический baseline `pnpm lint` после установки плагина (Task 1 Step 4); точный CSS-файл `ui` для `.ui-visually-hidden`; разметка бейджа непрочитанных в `app-shell.tsx`; значения `EntityStatus` для `status-label` map; существующие вызовы `SearchInput`/`LookupSelect`/`DataTable`/`Pagination`/`FilterBar` по фронту (новые пропсы опциональны — не должны ломать); барель-экспорт `packages/ui/src/index.ts`; `jsxA11y.flatConfigs.recommended` API-форма для ESLint 9 flat-config.
- **Гейт wired в ОБА пути линтования:** корневой `eslint.config.mjs` покрывает `packages/ui` (`pnpm lint` → `eslint src`) И `apps/frontend`; дополнительно `apps/frontend/.eslintrc.json` расширен для `next lint`. Без этого фиксы в `packages/ui` (где большинство примитивов) остались бы вне гейта.
- **Малые независимые задачи:** 12 задач, каждая — один примитив/срез + свой коммит, ревьюится изолированно. Порядок: гейт → триаж → утилита → примитивы → shell/forms → верификация → доки.
