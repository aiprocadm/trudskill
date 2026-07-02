# UI Redesign Phase 1 — Design System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Поднять дизайн-систему `packages/ui` до уровня, на котором Фазы 2–6 редизайна собираются из готовых деталей: иконки (lucide-react), CSS-мост токенов (отступы/радиусы/типографика), недостающие базовые компоненты (Button, Skeleton, StatCard, KeyValueList, Callout, Icon) и починка мелких рассинхронов (DateRangeField, англоязычные дефолты состояний).

**Architecture:** Всё аддитивно и обратно совместимо: ни один маршрут, экран или RBAC не трогаем. Новые CSS-переменные подмешиваются в существующий `UiThemeProvider` рядом с темами; новые React-компоненты — тонкие обёртки над УЖЕ существующими CSS-классами (`ui-button*`, `stat-card`, `kv-list`, `ui-skeleton-*`, `ui-callout*`); рефактор стилей заменяет захардкоженные px на `var(--ui-*)` с сохранением значений (радиусы вне шкалы нормализуются к ближайшему токену — единственное намеренное визуальное изменение).

**Tech Stack:** React 19, TypeScript (`exactOptionalPropertyTypes`), vitest (тесты — вызов компонента как функции + инспекция `props`, БЕЗ react-testing-library), styled-строки CSS в `packages/ui/src/styles/*`, pnpm workspace.

**Контекст из аудита (Фаза 0, 2026-07-01):**

- Токены `spacing/radius/shadows` живут только как JS-числа (`packages/ui/src/tokens/index.ts:1-7`) и НЕ проброшены в CSS — вся вёрстка хардкодит px.
- Иконок нет вообще: ни одной icon-библиотеки в зависимостях.
- Кнопка/стат-карточка/kv-список/скелетон существуют только как CSS-классы, React-компонентов нет.
- `DateRangeField` — единственный компонент без `ui-field`-обёртки и aria-меток.
- Дефолты `EmptyState`/`ErrorState`/`LoadingState` — английские; проверено grep-ом: ни один тест фронтенда/ui на них не завязан.
- Конвенция тестов пакета: см. `packages/ui/src/components/foundation.test.tsx` — компонент вызывается как функция, ассерты по `el.props`; импорты внутри тестов с суффиксом `.js`.

**Правила выполнения (из CLAUDE.md + договорённостей):**

- Комментарии в коде — на русском.
- Коммиты — Conventional Commits, скоуп `ui` / `frontend` / `plan`; каждый коммит завершать трейлером `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Прогон одного файла тестов: `pnpm --filter @trudskill/ui exec vitest run src/<путь> --no-file-parallelism`.
- Линт одного файла: `npx eslint <путь> --max-warnings=0`.
- Хуки не обходить (`--no-verify` запрещён).

---

### Task 1: Ветка

**Files:** нет (git).

- [x] **Step 1: Создать ветку от main**

```bash
git checkout main && git pull && git checkout -b feat/2026-07-02-ui-phase-1-design-system
```

Expected: ветка создана, `git status` чистый.

---

### Task 2: CSS-мост токенов (`baseVars`)

**Files:**

- Modify: `packages/ui/src/tokens/index.ts`
- Modify: `packages/ui/src/providers/theme-provider.tsx:68-71`
- Test: Create `packages/ui/src/tokens/base-vars.test.ts`

- [x] **Step 1: Написать падающий тест**

```ts
// packages/ui/src/tokens/base-vars.test.ts
import { describe, expect, it } from 'vitest';

import { baseVars, radius, spacing } from './index.js';

// baseVars — CSS-мост: JS-токены должны быть проброшены в --ui-* переменные 1:1.
describe('baseVars — CSS-мост токенов', () => {
  const vars: Record<string, string> = baseVars;

  it('каждый ключ spacing проброшен как --ui-space-<key> в px', () => {
    for (const [key, px] of Object.entries(spacing)) {
      expect(vars[`--ui-space-${key}`]).toBe(`${px}px`);
    }
  });

  it('каждый ключ radius проброшен как --ui-radius-<key> в px', () => {
    for (const [key, px] of Object.entries(radius)) {
      expect(vars[`--ui-radius-${key}`]).toBe(`${px}px`);
    }
  });

  it('типографическая шкала задана (размеры и веса)', () => {
    expect(vars['--ui-font-size-xs']).toBe('12px');
    expect(vars['--ui-font-size-sm']).toBe('13px');
    expect(vars['--ui-font-size-md']).toBe('15px');
    expect(vars['--ui-font-size-lg']).toBe('17px');
    expect(vars['--ui-font-size-xl']).toBe('22px');
    expect(vars['--ui-font-weight-medium']).toBe('500');
    expect(vars['--ui-font-weight-semibold']).toBe('600');
    expect(vars['--ui-font-weight-bold']).toBe('700');
    expect(vars['--ui-line-height-tight']).toBe('1.2');
    expect(vars['--ui-line-height-normal']).toBe('1.5');
  });
});
```

- [x] **Step 2: Убедиться, что тест падает**

Run: `pnpm --filter @trudskill/ui exec vitest run src/tokens/base-vars.test.ts --no-file-parallelism`
Expected: FAIL — `baseVars` не экспортируется.

- [x] **Step 3: Реализовать `baseVars`**

Добавить в конец `packages/ui/src/tokens/index.ts`:

```ts
// CSS-мост: базовые (не зависящие от темы) переменные — отступы, радиусы, типографика.
// Значения синхронизированы с JS-токенами spacing/radius (гарантируется base-vars.test.ts).
// Вёрстка в styles/* должна ссылаться на эти var(--ui-*), а не хардкодить px.
export const baseVars = {
  '--ui-space-xs': `${spacing.xs}px`,
  '--ui-space-sm': `${spacing.sm}px`,
  '--ui-space-md': `${spacing.md}px`,
  '--ui-space-lg': `${spacing.lg}px`,
  '--ui-space-xl': `${spacing.xl}px`,
  '--ui-space-xxl': `${spacing.xxl}px`,
  '--ui-radius-sm': `${radius.sm}px`,
  '--ui-radius-md': `${radius.md}px`,
  '--ui-radius-lg': `${radius.lg}px`,
  '--ui-radius-pill': `${radius.pill}px`,
  '--ui-font-size-xs': '12px',
  '--ui-font-size-sm': '13px',
  '--ui-font-size-md': '15px',
  '--ui-font-size-lg': '17px',
  '--ui-font-size-xl': '22px',
  '--ui-font-weight-medium': '500',
  '--ui-font-weight-semibold': '600',
  '--ui-font-weight-bold': '700',
  '--ui-line-height-tight': '1.2',
  '--ui-line-height-normal': '1.5'
} as const;
```

- [x] **Step 4: Подмешать `baseVars` в провайдер темы**

В `packages/ui/src/providers/theme-provider.tsx` заменить блок `useMemo` (строки 68–71):

```tsx
const vars = useMemo(() => {
  const source = resolved === 'dark' ? darkThemeVars : lightThemeVars;
  // Базовые переменные (отступы/радиусы/типографика) не зависят от темы и подмешиваются всегда.
  return { ...baseVars, ...source } as CSSProperties;
}, [resolved]);
```

и дополнить импорт токенов:

```tsx
import { baseVars, darkThemeVars, lightThemeVars } from '../tokens';
```

- [x] **Step 5: Прогнать тесты**

Run: `pnpm --filter @trudskill/ui exec vitest run src/tokens/base-vars.test.ts --no-file-parallelism`
Expected: PASS (3 теста).

- [x] **Step 6: Линт затронутых файлов и коммит**

```bash
npx eslint packages/ui/src/tokens/index.ts packages/ui/src/tokens/base-vars.test.ts packages/ui/src/providers/theme-provider.tsx --max-warnings=0
git add packages/ui/src/tokens/index.ts packages/ui/src/tokens/base-vars.test.ts packages/ui/src/providers/theme-provider.tsx
git commit -m "feat(ui): CSS-мост токенов — baseVars (--ui-space/radius/font-*) в UiThemeProvider" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Стили переводим на переменные шкалы (радиусы)

**Files:**

- Modify: `packages/ui/src/styles/foundation.ts`, `packages/ui/src/styles/forms.ts`, `packages/ui/src/styles/tables.ts`, `packages/ui/src/styles/layout.ts`, `packages/ui/src/styles/modal.ts`, `packages/ui/src/styles/chat.ts`, `packages/ui/src/styles/course-viewer.ts`
- Test: Create `packages/ui/src/styles/token-discipline.test.ts`

**Намеренное визуальное изменение:** радиусы вне шкалы (10, 13, 14 px → 12 px; 18, 20 px → 16 px) нормализуются к токенам. Это микроскопическая правка скруглений, согласованная в брифе («аккуратные тени и радиусы в токенах»).

- [x] **Step 1: Написать падающий тест-страж**

```ts
// packages/ui/src/styles/token-discipline.test.ts
import { describe, expect, it } from 'vitest';

import { uiGlobalStyles } from './index.js';

// Страж дисциплины токенов: радиусы задаются ТОЛЬКО через var(--ui-radius-*).
// Захардкоженный px-радиус из шкалы (или рядом с ней) — регрессия.
describe('дисциплина токенов в CSS-слоях', () => {
  it('нет захардкоженных px-радиусов шкалы', () => {
    expect(uiGlobalStyles).not.toMatch(/border-radius:\s*(8|10|12|13|14|16|18|20|999)px/);
  });

  it('CSS ссылается на переменные шкалы', () => {
    expect(uiGlobalStyles).toContain('var(--ui-radius-md)');
    expect(uiGlobalStyles).toContain('var(--ui-radius-lg)');
    expect(uiGlobalStyles).toContain('var(--ui-radius-pill)');
  });
});
```

- [x] **Step 2: Убедиться, что тест падает**

Run: `pnpm --filter @trudskill/ui exec vitest run src/styles/token-discipline.test.ts --no-file-parallelism`
Expected: FAIL — в стилях десятки `border-radius: 12px` и т.п.

- [x] **Step 3: Составить полный список вхождений**

Run (PowerShell):

```powershell
Select-String -Path "packages\ui\src\styles\*.ts" -Pattern "border-radius" | ForEach-Object { "$($_.Filename):$($_.LineNumber): $($_.Line.Trim())" }
```

Expected: список всех строк с `border-radius` по 7 файлам стилей.

- [x] **Step 4: Применить маппинг замен во всех файлах из списка**

Таблица замен (применять к значению `border-radius`; `border-radius: 50%` НЕ трогать — это круг аватара):

| Было                   | Стало                                  |
| ---------------------- | -------------------------------------- |
| `border-radius: 8px`   | `border-radius: var(--ui-radius-sm)`   |
| `border-radius: 10px`  | `border-radius: var(--ui-radius-md)`   |
| `border-radius: 12px`  | `border-radius: var(--ui-radius-md)`   |
| `border-radius: 13px`  | `border-radius: var(--ui-radius-md)`   |
| `border-radius: 14px`  | `border-radius: var(--ui-radius-md)`   |
| `border-radius: 16px`  | `border-radius: var(--ui-radius-lg)`   |
| `border-radius: 18px`  | `border-radius: var(--ui-radius-lg)`   |
| `border-radius: 20px`  | `border-radius: var(--ui-radius-lg)`   |
| `border-radius: 999px` | `border-radius: var(--ui-radius-pill)` |

Правки только внутри строк-шаблонов CSS — никакой логики файлы не содержат.

- [x] **Step 5: Прогнать тест-страж и весь пакет**

Run: `pnpm --filter @trudskill/ui test`
Expected: PASS все файлы, включая новый `token-discipline.test.ts` и существующий `smoke-visual.test.tsx`.

Примечание: если `smoke-visual.test.tsx` ассертит старые px-значения строкой (это тест на содержимое CSS-строк, не на поведение) — обновить его ассерты на `var(--ui-radius-*)` в этом же шаге.

- [x] **Step 6: Линт и коммит**

```bash
npx eslint packages/ui/src/styles --max-warnings=0
git add packages/ui/src/styles
git commit -m "refactor(ui): радиусы через var(--ui-radius-*) + тест-страж дисциплины токенов" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: lucide-react + компонент `Icon`

**Files:**

- Modify: `packages/ui/package.json`, `apps/frontend/package.json` (через pnpm)
- Create: `packages/ui/src/components/icon/index.tsx`
- Modify: `packages/ui/src/index.tsx`
- Test: Create `packages/ui/src/components/icon/icon.test.tsx`

- [x] **Step 1: Установить зависимость в оба пакета**

```bash
pnpm --filter @trudskill/ui add lucide-react
pnpm --filter @trudskill/frontend add lucide-react
```

Expected: `lucide-react` появляется в `dependencies` обоих package.json (frontend понадобится в Фазе 2 для иконок навигации — ставим сразу, чтобы не трогать deps дважды).

- [x] **Step 2: Написать падающий тест**

```tsx
// packages/ui/src/components/icon/icon.test.tsx
import { Home } from 'lucide-react';
import { describe, expect, it } from 'vitest';

import { Icon } from './index.js';

describe('Icon — единая обёртка над lucide-react', () => {
  it('декоративная по умолчанию: aria-hidden, размер 18, stroke 1.75', () => {
    const el = Icon({ icon: Home });
    expect(el.props['aria-hidden']).toBe(true);
    expect(el.props.size).toBe(18);
    expect(el.props.strokeWidth).toBe(1.75);
  });

  it('с label — самостоятельный смысл: role=img + aria-label, без aria-hidden', () => {
    const el = Icon({ icon: Home, label: 'Главная' });
    expect(el.props['aria-label']).toBe('Главная');
    expect(el.props.role).toBe('img');
    expect(el.props['aria-hidden']).toBeUndefined();
  });

  it('размер только из шкалы', () => {
    const el = Icon({ icon: Home, size: 24 });
    expect(el.props.size).toBe(24);
  });
});
```

- [x] **Step 3: Убедиться, что тест падает**

Run: `pnpm --filter @trudskill/ui exec vitest run src/components/icon/icon.test.tsx --no-file-parallelism`
Expected: FAIL — модуль `./index.js` не существует.

- [x] **Step 4: Реализовать компонент**

```tsx
// packages/ui/src/components/icon/index.tsx
import type { LucideIcon } from 'lucide-react';
import type { ReactElement } from 'react';

/** Шкала размеров иконок: 16 — в тексте/кнопке, 18 — по умолчанию, 20 — навигация, 24 — акцент. */
export type UiIconSize = 16 | 18 | 20 | 24;

// Единая точка стилизации иконок: один stroke, фиксированная шкала размеров.
// Без label иконка декоративная (aria-hidden); с label — самостоятельный смысл (role=img).
export const Icon = ({
  icon: Glyph,
  size = 18,
  label
}: {
  icon: LucideIcon;
  size?: UiIconSize;
  label?: string;
}): ReactElement => (
  <Glyph
    size={size}
    strokeWidth={1.75}
    focusable={false}
    aria-hidden={label ? undefined : true}
    {...(label ? { 'aria-label': label, role: 'img' } : {})}
  />
);

export type { LucideIcon };
```

- [x] **Step 5: Экспортировать из пакета**

В `packages/ui/src/index.tsx` после строки `export * from './components/permission/index';` добавить:

```ts
export * from './components/icon/index';
```

- [x] **Step 6: Прогнать тесты и коммит**

```bash
pnpm --filter @trudskill/ui exec vitest run src/components/icon/icon.test.tsx --no-file-parallelism
npx eslint packages/ui/src/components/icon --max-warnings=0
git add packages/ui/src/components/icon packages/ui/src/index.tsx packages/ui/package.json apps/frontend/package.json pnpm-lock.yaml
git commit -m "feat(ui): иконки — lucide-react + компонент Icon с a11y-контрактом" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: Компонент `Button`

**Files:**

- Create: `packages/ui/src/components/button/index.tsx`
- Modify: `packages/ui/src/styles/forms.ts` (добавка CSS для иконки в кнопке)
- Modify: `packages/ui/src/index.tsx`
- Test: Create `packages/ui/src/components/button/button.test.tsx`

- [x] **Step 1: Написать падающий тест**

```tsx
// packages/ui/src/components/button/button.test.tsx
import { describe, expect, it, vi } from 'vitest';

import { Button } from './index.js';

import type { ReactElement } from 'react';

describe('Button — обёртка над ui-button классами', () => {
  it('по умолчанию: type=button, класс ui-button, не disabled', () => {
    const el = Button({ children: 'Сохранить' });
    expect(el.props.type).toBe('button');
    expect(el.props.className).toBe('ui-button');
    expect(el.props.disabled).toBe(false);
  });

  it('variant → канонический BEM-модификатор ui-button--<variant>', () => {
    const el = Button({ variant: 'primary', children: 'Создать' });
    expect(el.props.className).toBe('ui-button ui-button--primary');
  });

  it('loading: класс --loading, disabled и aria-busy', () => {
    const el = Button({ loading: true, children: 'Сохранить' });
    expect(el.props.className).toContain('ui-button--loading');
    expect(el.props.disabled).toBe(true);
    expect(el.props['aria-busy']).toBe(true);
  });

  it('icon оборачивается в декоративный span', () => {
    const glyph = { type: 'svg', props: {} } as unknown as ReactElement;
    const el = Button({ icon: glyph, children: 'Экспорт' });
    const [iconSpan] = el.props.children as ReactElement[];
    expect(iconSpan.props.className).toBe('ui-button__icon');
    expect(iconSpan.props['aria-hidden']).toBe(true);
  });

  it('пробрасывает onClick и сливает className', () => {
    const onClick = vi.fn();
    const el = Button({ onClick, className: 'extra', children: 'Ок' });
    el.props.onClick();
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(el.props.className).toBe('ui-button extra');
  });
});
```

- [x] **Step 2: Убедиться, что тест падает**

Run: `pnpm --filter @trudskill/ui exec vitest run src/components/button/button.test.tsx --no-file-parallelism`
Expected: FAIL — модуль не существует.

- [x] **Step 3: Реализовать компонент**

```tsx
// packages/ui/src/components/button/index.tsx
import type { ButtonHTMLAttributes, ReactElement, ReactNode } from 'react';

export type ButtonVariant = 'default' | 'primary' | 'secondary' | 'ghost' | 'danger';

// Каноническая кнопка дизайн-системы. Использует ТОЛЬКО BEM-нотацию ui-button--<variant>
// (слитные алиасы ui-button-primary и т.п. считаются легаси и в новых экранах не используются).
export const Button = ({
  variant = 'default',
  loading = false,
  icon,
  children,
  className,
  type = 'button',
  disabled = false,
  ...rest
}: {
  variant?: ButtonVariant;
  loading?: boolean;
  /** Декоративная иконка слева от текста (обычно <Icon icon={...} size={16} />). */
  icon?: ReactNode;
} & ButtonHTMLAttributes<HTMLButtonElement>): ReactElement => {
  const classes = [
    'ui-button',
    variant !== 'default' ? `ui-button--${variant}` : '',
    loading ? 'ui-button--loading' : '',
    className ?? ''
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <button
      type={type}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {icon ? (
        <span className="ui-button__icon" aria-hidden={true}>
          {icon}
        </span>
      ) : null}
      {children}
    </button>
  );
};
```

- [x] **Step 4: Добавить CSS для флекс-раскладки и иконки**

В `packages/ui/src/styles/forms.ts` после строки с `.ui-button--loading::after { ... }` (конец блока лоадера, перед закрывающим бэктиком) добавить:

```
.ui-button,.ui-button--primary,.ui-button--secondary,.ui-button--ghost,.ui-button--danger { display: inline-flex; align-items: center; justify-content: center; gap: var(--ui-space-sm); }
.ui-button__icon { display: inline-flex; }
.ui-button__icon svg { width: 16px; height: 16px; }
```

Примечание: правило вешается на классы `.ui-button*`, а не на голый селектор `button`, чтобы не менять раскладку нативных кнопок по всему приложению.

- [x] **Step 5: Экспортировать из пакета**

В `packages/ui/src/index.tsx` после `export * from './components/icon/index';` добавить:

```ts
export * from './components/button/index';
```

- [x] **Step 6: Прогнать тесты и коммит**

```bash
pnpm --filter @trudskill/ui test
npx eslint packages/ui/src/components/button packages/ui/src/styles/forms.ts --max-warnings=0
git add packages/ui/src/components/button packages/ui/src/styles/forms.ts packages/ui/src/index.tsx
git commit -m "feat(ui): компонент Button (variant/loading/icon) поверх ui-button классов" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 6: Компонент `Skeleton`

> **Коррекция 2026-07-02 (до реализации):** первоначальная версия задачи предлагала проп `kind: 'line' | 'block'`, где `block` рендерил одиночный `div.ui-skeleton-block`. Это ошибка: `.ui-skeleton-block` в `foundation.ts:195` — grid-КОНТЕЙНЕР (`display:grid; gap:10px`, без фона и высоты), а не самостоятельный прямоугольник; одиночный элемент был бы невидим. Все 4 реальных использования во фронтенде (`learner-home/my-courses-list.tsx`, `learner-home/next-step-card.tsx`, `course-viewer/course-viewer-screen.tsx`, `mvp/screens.tsx`) — контейнер `ui-skeleton-block` с N линиями `ui-skeleton-line` внутри. API упрощён до одного пропа `lines`.

**Files:**

- Create: `packages/ui/src/components/skeleton/index.tsx`
- Modify: `packages/ui/src/index.tsx`
- Test: Create `packages/ui/src/components/skeleton/skeleton.test.tsx`

- [x] **Step 1: Написать падающий тест**

```tsx
// packages/ui/src/components/skeleton/skeleton.test.tsx
import { describe, expect, it } from 'vitest';

import { Skeleton } from './index.js';

import type { ReactElement } from 'react';

describe('Skeleton — заглушка загрузки', () => {
  it('контейнер: ui-skeleton-block, role=status, русская метка', () => {
    const el = Skeleton({});
    expect(el.props.className).toBe('ui-skeleton-block');
    expect(el.props.role).toBe('status');
    expect(el.props['aria-label']).toBe('Загрузка');
  });

  it('рендерит N линий ui-skeleton-line, каждая декоративная', () => {
    const el = Skeleton({ lines: 3 });
    const rows = el.props.children as ReactElement[];
    expect(rows).toHaveLength(3);
    expect(rows[0]?.props.className).toBe('ui-skeleton-line');
    expect(rows[0]?.props['aria-hidden']).toBe(true);
  });

  it('lines по умолчанию 3, минимум 1', () => {
    expect(Skeleton({}).props.children as ReactElement[]).toHaveLength(3);
    expect(Skeleton({ lines: 0 }).props.children as ReactElement[]).toHaveLength(1);
  });
});
```

- [x] **Step 2: Убедиться, что тест падает**

Run: `pnpm --filter @trudskill/ui exec vitest run src/components/skeleton/skeleton.test.tsx --no-file-parallelism`
Expected: FAIL — модуль не существует.

- [x] **Step 3: Реализовать компонент**

```tsx
// packages/ui/src/components/skeleton/index.tsx
import type { ReactElement } from 'react';

// Скелетон поверх готовых CSS-классов: ui-skeleton-block — grid-контейнер (foundation.ts),
// ui-skeleton-line — мерцающая полоса. Контейнер — единый live-region, полосы декоративные.
// Ширины линий чередуются (70/80/90%), как в существующих экранных скелетонах.
export const Skeleton = ({ lines = 3 }: { lines?: number }): ReactElement => (
  <div className="ui-skeleton-block" role="status" aria-live="polite" aria-label="Загрузка">
    {Array.from({ length: Math.max(1, lines) }, (_, index) => (
      <div
        key={index}
        className="ui-skeleton-line"
        style={{ width: `${70 + (index % 3) * 10}%` }}
        aria-hidden={true}
      />
    ))}
  </div>
);
```

- [x] **Step 4: Экспортировать из пакета**

В `packages/ui/src/index.tsx` после `export * from './components/button/index';` добавить:

```ts
export * from './components/skeleton/index';
```

- [x] **Step 5: Прогнать тесты и коммит**

```bash
pnpm --filter @trudskill/ui exec vitest run src/components/skeleton/skeleton.test.tsx --no-file-parallelism
npx eslint packages/ui/src/components/skeleton --max-warnings=0
git add packages/ui/src/components/skeleton packages/ui/src/index.tsx
git commit -m "feat(ui): компонент Skeleton поверх ui-skeleton-* классов" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Компонент `StatCard`

**Files:**

- Create: `packages/ui/src/components/stat-card/index.tsx`
- Modify: `packages/ui/src/index.tsx`
- Test: Create `packages/ui/src/components/stat-card/stat-card.test.tsx`

- [x] **Step 1: Написать падающий тест**

```tsx
// packages/ui/src/components/stat-card/stat-card.test.tsx
import { describe, expect, it } from 'vitest';

import { StatCard } from './index.js';

import type { ReactElement } from 'react';

describe('StatCard — метрика дашборда', () => {
  it('рендерит label и value в классы stat-card__*', () => {
    const el = StatCard({ label: 'Слушатели', value: 128 });
    expect(el.props.className).toBe('stat-card');
    const [label, value, sub] = el.props.children as (ReactElement | null)[];
    expect(label?.props.className).toBe('stat-card__label');
    expect(label?.props.children).toBe('Слушатели');
    expect(value?.props.className).toBe('stat-card__value');
    expect(value?.props.children).toBe(128);
    expect(sub).toBeNull();
  });

  it('sub опционален', () => {
    const el = StatCard({ label: 'Сдано', value: '87%', sub: 'за 30 дней' });
    const [, , sub] = el.props.children as ReactElement[];
    expect(sub.props.className).toBe('stat-card__sub');
    expect(sub.props.children).toBe('за 30 дней');
  });
});
```

- [x] **Step 2: Убедиться, что тест падает**

Run: `pnpm --filter @trudskill/ui exec vitest run src/components/stat-card/stat-card.test.tsx --no-file-parallelism`
Expected: FAIL — модуль не существует.

- [x] **Step 3: Реализовать компонент**

```tsx
// packages/ui/src/components/stat-card/index.tsx
import type { ReactElement, ReactNode } from 'react';

// Карточка-метрика поверх готовых CSS-классов stat-card__* (foundation.ts).
// value — ReactNode: число, строка или готовый узел с форматированием.
export const StatCard = ({
  label,
  value,
  sub
}: {
  label: string;
  value: ReactNode;
  sub?: string;
}): ReactElement => (
  <div className="stat-card">
    <span className="stat-card__label">{label}</span>
    <span className="stat-card__value">{value}</span>
    {sub ? <span className="stat-card__sub">{sub}</span> : null}
  </div>
);
```

- [x] **Step 4: Экспортировать из пакета**

В `packages/ui/src/index.tsx` после `export * from './components/skeleton/index';` добавить:

```ts
export * from './components/stat-card/index';
```

- [x] **Step 5: Прогнать тесты и коммит**

```bash
pnpm --filter @trudskill/ui exec vitest run src/components/stat-card/stat-card.test.tsx --no-file-parallelism
npx eslint packages/ui/src/components/stat-card --max-warnings=0
git add packages/ui/src/components/stat-card packages/ui/src/index.tsx
git commit -m "feat(ui): компонент StatCard поверх stat-card классов" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 8: Компонент `KeyValueList`

**Files:**

- Create: `packages/ui/src/components/key-value-list/index.tsx`
- Modify: `packages/ui/src/index.tsx`
- Test: Create `packages/ui/src/components/key-value-list/key-value-list.test.tsx`

Контекст: в CSS живут ТРИ синонима key/value-списка (`kv-list`, `ui-data-list`, `ui-defs`). Канон — `kv-list`; компонент закрепляет его, синонимы удалим при миграции страниц (Фаза 4), не сейчас.

- [x] **Step 1: Написать падающий тест**

```tsx
// packages/ui/src/components/key-value-list/key-value-list.test.tsx
import { describe, expect, it } from 'vitest';

import { KeyValueList } from './index.js';

import type { ReactElement } from 'react';

describe('KeyValueList — канонический key/value список (dl.kv-list)', () => {
  it('рендерит dl.kv-list со строками dt/dd', () => {
    const el = KeyValueList({
      items: [
        { label: 'ИНН', value: '7701234567' },
        { label: 'Статус', value: 'Активен' }
      ]
    });
    expect(el.type).toBe('dl');
    expect(el.props.className).toBe('kv-list');
    const rows = el.props.children as ReactElement[];
    expect(rows).toHaveLength(2);
    const [dt, dd] = rows[0]?.props.children as ReactElement[];
    expect(rows[0]?.props.className).toBe('kv-list__row');
    expect(dt.type).toBe('dt');
    expect(dt.props.children).toBe('ИНН');
    expect(dd.type).toBe('dd');
    expect(dd.props.children).toBe('7701234567');
  });
});
```

- [x] **Step 2: Убедиться, что тест падает**

Run: `pnpm --filter @trudskill/ui exec vitest run src/components/key-value-list/key-value-list.test.tsx --no-file-parallelism`
Expected: FAIL — модуль не существует.

- [x] **Step 3: Реализовать компонент**

```tsx
// packages/ui/src/components/key-value-list/index.tsx
import type { ReactElement, ReactNode } from 'react';

export interface KeyValueItem {
  label: string;
  value: ReactNode;
}

// Канонический key/value-список деталей сущности (dl.kv-list из foundation.ts).
// Синонимичные классы ui-data-list / ui-defs — легаси, в новых экранах использовать этот компонент.
export const KeyValueList = ({ items }: { items: KeyValueItem[] }): ReactElement => (
  <dl className="kv-list">
    {items.map((item) => (
      <div key={item.label} className="kv-list__row">
        <dt>{item.label}</dt>
        <dd>{item.value}</dd>
      </div>
    ))}
  </dl>
);
```

- [x] **Step 4: Экспортировать из пакета**

В `packages/ui/src/index.tsx` после `export * from './components/stat-card/index';` добавить:

```ts
export * from './components/key-value-list/index';
```

- [x] **Step 5: Прогнать тесты и коммит**

```bash
pnpm --filter @trudskill/ui exec vitest run src/components/key-value-list/key-value-list.test.tsx --no-file-parallelism
npx eslint packages/ui/src/components/key-value-list --max-warnings=0
git add packages/ui/src/components/key-value-list packages/ui/src/index.tsx
git commit -m "feat(ui): компонент KeyValueList — канонический dl.kv-list" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 9: Компонент `Callout`

**Files:**

- Create: `packages/ui/src/components/callout/index.tsx`
- Modify: `packages/ui/src/styles/foundation.ts` (класс заголовка каллаута)
- Modify: `packages/ui/src/index.tsx`
- Test: Create `packages/ui/src/components/callout/callout.test.tsx`

- [x] **Step 1: Написать падающий тест**

```tsx
// packages/ui/src/components/callout/callout.test.tsx
import { describe, expect, it } from 'vitest';

import { Callout } from './index.js';

import type { ReactElement } from 'react';

describe('Callout — статичная плашка-уведомление', () => {
  it('info/success — role=status', () => {
    expect(Callout({ tone: 'info', children: 'Совет' }).props.role).toBe('status');
    expect(Callout({ tone: 'success', children: 'Готово' }).props.role).toBe('status');
  });

  it('warning/danger — role=alert', () => {
    expect(Callout({ tone: 'warning', children: 'Внимание' }).props.role).toBe('alert');
    expect(Callout({ tone: 'danger', children: 'Ошибка' }).props.role).toBe('alert');
  });

  it('класс тона и опциональный заголовок', () => {
    const el = Callout({
      tone: 'warning',
      title: 'Проверьте данные',
      children: 'СНИЛС не прошёл контроль'
    });
    expect(el.props.className).toBe('ui-callout ui-callout--warning');
    const body = el.props.children as ReactElement;
    const [title] = body.props.children as ReactElement[];
    expect(title.props.className).toBe('ui-callout__title');
    expect(title.props.children).toBe('Проверьте данные');
  });

  it('tone по умолчанию — info', () => {
    expect(Callout({ children: 'Текст' }).props.className).toBe('ui-callout ui-callout--info');
  });
});
```

- [x] **Step 2: Убедиться, что тест падает**

Run: `pnpm --filter @trudskill/ui exec vitest run src/components/callout/callout.test.tsx --no-file-parallelism`
Expected: FAIL — модуль не существует.

- [x] **Step 3: Реализовать компонент**

```tsx
// packages/ui/src/components/callout/index.tsx
import type { ReactElement, ReactNode } from 'react';

export type CalloutTone = 'info' | 'success' | 'warning' | 'danger';

// Статичная плашка поверх готовых классов ui-callout--<tone> (foundation.ts).
// info/success — фоновое status-сообщение; warning/danger — alert (озвучивается сразу).
export const Callout = ({
  tone = 'info',
  title,
  children
}: {
  tone?: CalloutTone;
  title?: string;
  children: ReactNode;
}): ReactElement => (
  <div
    className={`ui-callout ui-callout--${tone}`}
    role={tone === 'warning' || tone === 'danger' ? 'alert' : 'status'}
  >
    <div>
      {title ? <p className="ui-callout__title">{title}</p> : null}
      {children}
    </div>
  </div>
);
```

- [x] **Step 4: Добавить CSS заголовка каллаута**

В `packages/ui/src/styles/foundation.ts` сразу после строки `.ui-callout--danger { ... }` (строка 74) добавить:

```
.ui-callout__title { margin: 0 0 4px; font-weight: var(--ui-font-weight-semibold); font-size: var(--ui-font-size-sm); }
```

- [x] **Step 5: Экспортировать из пакета**

В `packages/ui/src/index.tsx` после `export * from './components/key-value-list/index';` добавить:

```ts
export * from './components/callout/index';
```

- [x] **Step 6: Прогнать тесты и коммит**

```bash
pnpm --filter @trudskill/ui test
npx eslint packages/ui/src/components/callout packages/ui/src/styles/foundation.ts --max-warnings=0
git add packages/ui/src/components/callout packages/ui/src/styles/foundation.ts packages/ui/src/index.tsx
git commit -m "feat(ui): компонент Callout (info/success/warning/danger) поверх ui-callout" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 10: `DateRangeField` приводим к контракту полей

**Files:**

- Modify: `packages/ui/src/components/date-range/index.tsx` (полная замена содержимого)
- Test: Create `packages/ui/src/components/date-range/date-range.test.tsx`

Контекст: сейчас это два голых `<input type="date">` без обёртки `ui-field`, без подписи и aria-меток (единственный «неодетый» филд в пакете). API остаётся обратно совместимым: `label` — новый необязательный проп.

- [x] **Step 1: Написать падающий тест**

```tsx
// packages/ui/src/components/date-range/date-range.test.tsx
import { describe, expect, it, vi } from 'vitest';

import { DateRangeField } from './index.js';

import type { ReactElement } from 'react';

describe('DateRangeField — диапазон дат в контракте ui-field', () => {
  it('обёрнут в ui-field с подписью по умолчанию «Период»', () => {
    const el = DateRangeField({ value: {}, onChange: () => {} });
    expect(el.props.className).toBe('ui-field');
    const [label] = el.props.children as ReactElement[];
    expect(label.props.className).toBe('ui-field-label');
    expect(label.props.children).toBe('Период');
  });

  it('оба input имеют класс ui-input и aria-метки «с»/«по»', () => {
    const el = DateRangeField({
      value: { from: '2026-07-01', to: '2026-07-31' },
      onChange: () => {}
    });
    const [, row] = el.props.children as ReactElement[];
    const [from, to] = row.props.children as ReactElement[];
    expect(from.props.className).toBe('ui-input');
    expect(from.props['aria-label']).toBe('Период: с');
    expect(from.props.value).toBe('2026-07-01');
    expect(to.props['aria-label']).toBe('Период: по');
    expect(to.props.value).toBe('2026-07-31');
  });

  it('onChange отдаёт обновлённый диапазон', () => {
    const onChange = vi.fn();
    const el = DateRangeField({ value: { from: '2026-07-01' }, onChange });
    const [, row] = el.props.children as ReactElement[];
    const [, to] = row.props.children as ReactElement[];
    to.props.onChange({ target: { value: '2026-07-31' } });
    expect(onChange).toHaveBeenCalledWith({ from: '2026-07-01', to: '2026-07-31' });
  });
});
```

- [x] **Step 2: Убедиться, что тест падает**

Run: `pnpm --filter @trudskill/ui exec vitest run src/components/date-range/date-range.test.tsx --no-file-parallelism`
Expected: FAIL — нет `ui-field`-обёртки и aria-меток.

- [x] **Step 3: Переписать компонент**

Полное новое содержимое `packages/ui/src/components/date-range/index.tsx`:

```tsx
import type { DateRangeFilter } from '@trudskill/shared-types';
import type { ReactElement } from 'react';

// Диапазон дат в общем контракте полей: обёртка ui-field + подпись + ui-input у обоих инпутов.
// label необязателен — по умолчанию «Период» (обратная совместимость по API сохранена).
export const DateRangeField = ({
  value,
  onChange,
  label = 'Период'
}: {
  value: DateRangeFilter;
  onChange: (value: DateRangeFilter) => void;
  label?: string;
}): ReactElement => (
  <div className="ui-field">
    <span className="ui-field-label">{label}</span>
    <div className="ui-inline">
      <input
        className="ui-input"
        type="date"
        aria-label={`${label}: с`}
        value={value.from?.slice(0, 10) ?? ''}
        onChange={(e) => onChange({ ...value, from: e.target.value })}
      />
      <input
        className="ui-input"
        type="date"
        aria-label={`${label}: по`}
        value={value.to?.slice(0, 10) ?? ''}
        onChange={(e) => onChange({ ...value, to: e.target.value })}
      />
    </div>
  </div>
);
```

- [x] **Step 4: Прогнать тесты пакета и типы фронтенда**

```bash
pnpm --filter @trudskill/ui test
pnpm --filter @trudskill/frontend typecheck
```

Expected: PASS оба (изменение API аддитивно, вызовы фронтенда компилируются без правок).

- [x] **Step 5: Линт и коммит**

```bash
npx eslint packages/ui/src/components/date-range --max-warnings=0
git add packages/ui/src/components/date-range
git commit -m "fix(ui): DateRangeField — ui-field обёртка, ui-input классы, aria-метки" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 11: Русские дефолты состояний

**Files:**

- Modify: `packages/ui/src/components/states/index.tsx`
- Test: Create `packages/ui/src/components/states/states.test.tsx`

Контекст: дефолты 'No data yet' / 'Something went wrong' / 'Loading...' — английские в русскоязычном продукте. Проверено grep-ом (Фаза 0): ни один тест ui/frontend не ассертит эти строки — замена безопасна.

- [x] **Step 1: Написать падающий тест**

```tsx
// packages/ui/src/components/states/states.test.tsx
import { describe, expect, it } from 'vitest';

import { EmptyState, ErrorState, LoadingState } from './index.js';

describe('состояния — русские дефолты', () => {
  it('EmptyState: «Нет данных»', () => {
    const el = EmptyState({});
    const [message] = el.props.children as unknown[];
    expect(message).toBe('Нет данных');
  });

  it('ErrorState: «Не удалось загрузить данные»', () => {
    expect(ErrorState({}).props.children).toBe('Не удалось загрузить данные');
  });

  it('LoadingState: «Загрузка…»', () => {
    expect(LoadingState({}).props.children).toBe('Загрузка…');
  });

  it('переопределение message сохраняется', () => {
    expect(ErrorState({ message: 'Сбой сети' }).props.children).toBe('Сбой сети');
  });
});
```

- [x] **Step 2: Убедиться, что тест падает**

Run: `pnpm --filter @trudskill/ui exec vitest run src/components/states/states.test.tsx --no-file-parallelism`
Expected: FAIL — дефолты английские.

- [x] **Step 3: Заменить дефолты**

В `packages/ui/src/components/states/index.tsx`:

- строка 4: `message = 'No data yet',` → `message = 'Нет данных',`
- строка 16: `message = 'Something went wrong'` → `message = 'Не удалось загрузить данные'`
- строка 24: `message = 'Loading...'` → `message = 'Загрузка…'`

- [x] **Step 4: Прогнать тесты ui и фронтенда**

```bash
pnpm --filter @trudskill/ui test
pnpm test:frontend
```

Expected: PASS оба (~190 тестов фронтенда за ~15с).

- [x] **Step 5: Линт и коммит**

```bash
npx eslint packages/ui/src/components/states --max-warnings=0
git add packages/ui/src/components/states
git commit -m "fix(ui): русские дефолты EmptyState/ErrorState/LoadingState" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 12: Финальная проверка и документация

**Files:**

- Modify: `README.md` (§2 «AI Agent State»)
- Modify: `LMS_AGENT_HANDOFF.md` (новая запись §5.XX — взять следующий свободный номер)
- Modify: `docs/superpowers/plans/2026-07-02-ui-redesign-phase-1-design-system.md` (отметить чекбоксы)

- [x] **Step 1: Полный прогон качества**

```bash
pnpm --filter @trudskill/ui lint
pnpm --filter @trudskill/ui typecheck
pnpm --filter @trudskill/ui test
pnpm --filter @trudskill/frontend typecheck
pnpm test:frontend
```

Expected: всё зелёное. Если что-то красное — чинить до перехода дальше (не коммитить красное).

- [x] **Step 2: Обновить README §2 «AI Agent State»**

Заполнить: Current Stage — «UI redesign Phase 1 (design system) complete»; Last Completed Task — эта фаза; Next Task — «Phase 2: grouped sidebar + command palette»; Last Updated At/By.

- [x] **Step 3: Добавить запись в LMS_AGENT_HANDOFF §5**

Шаблон записи (номер — следующий свободный после текущего максимума в файле):

```markdown
### 5.XX UI redesign Phase 1 — дизайн-система (2026-07-02)

По плану docs/superpowers/plans/2026-07-02-ui-redesign-phase-1-design-system.md (Фаза 1 из 6).

- Токены: baseVars (--ui-space/radius/font-_) подмешаны в UiThemeProvider; радиусы в styles/_ переведены на var(--ui-radius-\*), магические значения нормализованы к шкале; тест-страж token-discipline.test.ts.
- Иконки: lucide-react в @trudskill/ui и @trudskill/frontend; компонент Icon (размерная шкала 16/18/20/24, stroke 1.75, a11y-контракт).
- Новые компоненты: Button, Skeleton, StatCard, KeyValueList, Callout — тонкие обёртки над существующими CSS-классами.
- Фиксы: DateRangeField в контракте ui-field; русские дефолты EmptyState/ErrorState/LoadingState.
- Тесты: ui + frontend зелёные, typecheck зелёный. Ничего не мигрировано — страницы/маршруты/RBAC не тронуты.
  Следующий шаг: Фаза 2 — сгруппированный сайдбар (10 блоков), командная палитра Ctrl/⌘+K, крошки.
```

- [x] **Step 4: Отметить выполненные чекбоксы в этом плане и закоммитить документацию**

```bash
git add README.md LMS_AGENT_HANDOFF.md docs/superpowers/plans/2026-07-02-ui-redesign-phase-1-design-system.md
git commit -m "docs(plan): фаза 1 дизайн-системы выполнена — handoff §5.XX + README §2" -m "Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

- [x] **Step 5: Финиш ветки**

REQUIRED SUB-SKILL: `superpowers:finishing-a-development-branch` — предложить пользователю PR/merge (PR squash-merge, описание по шаблону `## Summary` + `## Test plan`).

---

## Отклонения от плана (итог выполнения, 2026-07-02)

Код и тесты — канон (SSOT §3); сниппеты выше в тексте задач НЕ обновлялись задним числом. Фактические отличия финального кода:

1. **Task 2:** merge базовых и темовых переменных вынесен из `useMemo` в экспортируемую чистую функцию `buildThemeVars` (+ тест `theme-provider.test.ts`, + страж непересечения ключей в `base-vars.test.ts`) — по код-ревью Задачи 2.
2. **Task 2 (попутно):** vitest include пакета расширен `*.test.tsx` → `*.test.{ts,tsx}` — иначе `.ts`-тесты не запускались.
3. **Task 3:** `chat.ts` в списке файлов, но в диффе отсутствует — в нём нет ни одного `border-radius` (проверено до и после). Регекс стража позже усилен (longhand + все позиции shorthand + ассерт `--ui-radius-sm`) — коммит `1f98030`.
4. **Task 5:** JSDoc пропа `icon` уточнён (CSS принудительно 16px); добавлен негативный ассерт `aria-busy`; CSS `.ui-button--loading:disabled { opacity: 1; }` — по код-ревью Задачи 5.
5. **Task 6:** API `Skeleton` скорректирован ДО реализации (см. блок «Коррекция 2026-07-02» в тексте задачи) — `kind`-вариант отменён.
6. **Task 8:** key строк — `` `${item.label}-${index}` `` (дубли label), не `item.label` — фикс-коммит `502db8a`.
7. **Task 9:** у `Callout` добавлен опциональный проп `role?: 'alert' | 'status'` (override для статичных баннеров) — фикс-коммит `502db8a`.
8. **Порядок выполнения:** задачи 6–11 реализованы контроллером инлайн (сбой диспетчера субагентов), затем прошли spec+quality ревью постфактум; полный список known issues — handoff §5.155.
