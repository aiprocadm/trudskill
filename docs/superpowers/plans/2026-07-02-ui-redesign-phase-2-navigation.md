# UI Redesign Фаза 2 — Навигация и оболочка (shell)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Заменить плоский сайдбар («основные» + `<details>` «Еще разделы») на 10 сворачиваемых смысловых блоков, добавить командную палитру Ctrl/⌘+K и привести хлебные крошки к иерархии «Блок → Страница → Деталь» — всё как чисто презентационная надстройка над неизменной RBAC-логикой.

**Architecture:** Группировка — это данные (`NAV_GROUPS`) + чистая функция `getGroupedNavigation(session)`, которая берёт уже отфильтрованный по правам вывод `getVisibleNavigation` и раскладывает его по блокам. `evaluateRouteAccess` / `hasPermission` / `getVisibleNavigation` / `resolveRouteMeta` не меняются по смыслу. Иконки идут только через `<Icon>` из `@trudskill/ui`; единственный файл фронтенда, которому разрешён прямой импорт `lucide-react`, — курируемый реестр `nav-icons.ts` (ESLint-исключение).

**Tech Stack:** Next.js 15 App Router, TypeScript (`exactOptionalPropertyTypes: true`), `@trudskill/ui` (`Icon`, `VISUALLY_HIDDEN_CLASS`), `lucide-react@^1.23.0`, Vitest (без React Testing Library — «E2E» = permission/pure/smoke), ESLint flat config.

---

## Контекст: что уже есть (проверено чтением кода 2026-07-02)

- **`apps/frontend/src/features/navigation/model.ts`** — только данные + типы. Экспортит `RouteMeta`, `RouteMetaEntry`, `NavigationItem`, `routeMeta` (77 записей), `navigationModel` (62 записи). У `NavigationItem` поля `{ href, label, requiredPermissions?, navSlot?: 'main'|'more' }`. **Нет** поля `group`, **нет** поля `icon`.
- **`apps/frontend/src/features/navigation/helpers.ts`** — RBAC-ядро: `normalizePath` (не экспортится), `isPatternMatch`, `resolveRouteMeta`, `getVisibleNavigation`, `getNavigationView`, `evaluateRouteAccess`.
- **`apps/frontend/src/features/navigation/breadcrumbs.ts`** — `buildBreadcrumbs(pathname) → { label, href }[]`. Использует `hrefToLabel` (Map из `navigationModel`) + статический `segmentLabels` + эвристику `looksLikeId`. `routeMeta` не трогает.
- **`apps/frontend/src/features/navigation/role-blueprints.ts`** — `getPrimaryRoleBlueprint` (отображение роли), `getSessionRoleBlueprints` (порядок main/more, используется только в `getNavigationView`).
- **`apps/frontend/src/widgets/shell/app-shell.tsx`** — потребляет `getNavigationView(session)`, рисует «основные» + `<details>` «Еще разделы». Мобильный drawer через `mobileNavOpen`. Топбар с live-region счётчика уведомлений. Skip-link. `<style jsx>` с токенами `--ui-nav-*`.
- **`@trudskill/ui`** `Icon`: API — `<Icon icon={LucideComponentRef} size={16|18|20|24} label? />`. **Нет** `className`. Глифы импортируются из `lucide-react` (PascalCase), передаются как значение. `LucideIcon` тип реэкспортится из `@trudskill/ui`.
- **ESLint** — авторитетный `eslint.config.mjs` (flat). Уже есть глобальный `no-restricted-imports` (форма `patterns`). Правило **replace-not-merge** между блоками для одинаковых файлов → при добавлении в frontend-блок нужно продублировать глобальный `patterns`. Прямых импортов `lucide-react` во фронтенде сейчас **ноль**.
- **Инвариант-тест §5.154** — `helpers.test.ts:74-79`: каждый `navigationModel[].href` обязан резолвиться в `routeMeta`. Новые пункты меню → обязаны иметь `routeMeta`.
- **`getNavigationView` 7-cap тест** — `helpers.test.ts:87-91`: `main.length <= 7`, `more.length > 0`. Мы **не трогаем** `getNavigationView`/`navSlot` → тест остаётся зелёным.
- **Проверенные риски:** `/mailings` и `/crm/deals` не упоминаются ни в одном e2e-тесте (скрыть безопасно). Тест `payments.e2e.test.ts:120` (`оплат`) относится к `/learner/payments` «Мои оплаты» — мы его не русифицируем.

---

## Решения владельца (нужно «ок» перед кодом)

| #   | Решение                                                | Значение по умолчанию (предложено)                                                                                                       |
| --- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Права `routeMeta` для сироты `/admin/issuance-journal` | `['tenant.read']` (как `/documents`)                                                                                                     |
| D2  | Права `routeMeta` для сироты `/admin/licenses`         | `['auth.manage_sessions']` (админ-only, как `/audit`, `/admin/cockpit`). Сужение прав — отдельный PR.                                    |
| D3  | Русификация 3 меток                                    | `/student/dashboard` → «Панель студента»; `/teacher/grading-center` → «Центр проверки работ»; `/admin/cockpit` → «Панель администратора» |
| D4  | `getNavigationView` + его тест                         | Оставляем как есть (superseded группами; удаление каскадит в role-blueprints — вне scope Фазы 2). Помечаем комментарием.                 |
| D5  | Крошка-блок                                            | Ненавигационная (обычный текст, без `href`)                                                                                              |
| D6  | Экспозиция иконок                                      | Единственный ESLint-исключённый файл `nav-icons.ts` реэкспортит нужные глифы lucide; все прочие импортируют оттуда                       |

Блоки и иконки — из промта Фазы 2 (согласованы). Порядок блоков и пунктов внутри блока — как в таблице промта.

---

## Карта файлов

**Новые:**

- `apps/frontend/src/features/navigation/nav-icons.ts` — курируемый реестр глифов lucide (ESLint-исключение).
- `apps/frontend/src/features/navigation/nav-groups.ts` — `NAV_GROUPS`, `getGroupedNavigation`, `resolveGroupForPath`.
- `apps/frontend/src/features/navigation/nav-groups.test.ts` — покрытие групп + группировка + резолв блока.
- `apps/frontend/src/features/navigation/command-palette.ts` — чистая логика палитры (`filterCommands`, `buildCommandItems`).
- `apps/frontend/src/features/navigation/command-palette.test.ts` — юнит-тесты чистой логики.
- `apps/frontend/src/widgets/shell/command-palette.tsx` — компонент палитры (модалка, listbox, клавиатура).
- `apps/frontend/src/e2e/navigation-shell.e2e.test.ts` — smoke-импорт `AppShell` + `CommandPalette`.

**Изменяемые:**

- `apps/frontend/src/features/navigation/model.ts` — 3 сироты (routeMeta+nav), скрыть 2 заглушки (nav), русификация 3 меток.
- `apps/frontend/src/features/navigation/helpers.test.ts` — тесты сирот/заглушек/меток.
- `apps/frontend/src/features/navigation/breadcrumbs.ts` — крошка-блок, `href?` опционален.
- `apps/frontend/src/features/navigation/breadcrumbs.test.ts` — обновить 2 теста + крошка-блок.
- `apps/frontend/src/widgets/shell/app-shell.tsx` — сгруппированный сайдбар, палитра, топбар, рендер крошек.
- `eslint.config.mjs` — `no-restricted-imports` на `lucide-react` во фронтенде + исключение для `nav-icons.ts`.

**НЕ трогаем:** `helpers.ts` (RBAC-ядро — только читаем `getVisibleNavigation`, `resolveRouteMeta`), `role-blueprints.ts`, бэкенд, контракты, миграции.

---

## Task 1: Данные — сироты, заглушки, русификация меток

**Files:**

- Modify: `apps/frontend/src/features/navigation/model.ts`
- Modify (tests): `apps/frontend/src/features/navigation/helpers.test.ts`

- [ ] **Step 1: Написать падающие тесты (в `helpers.test.ts`, перед закрывающим `});` describe-блока, после строки 120)**

```ts
// === Фаза 2 — сироты, заглушки, русификация ===

it('routeMeta: сирота /admin/issuance-journal доступен как /documents (tenant.read)', () => {
  expect(resolveRouteMeta('/admin/issuance-journal')?.requiredPermissions).toEqual(['tenant.read']);
});

it('routeMeta: сирота /admin/licenses — админ-only (auth.manage_sessions)', () => {
  expect(resolveRouteMeta('/admin/licenses')?.requiredPermissions).toEqual([
    'auth.manage_sessions'
  ]);
});

it('nav: 3 сироты присутствуют в меню', () => {
  const hrefs = navigationModel.map((item) => item.href);
  expect(hrefs).toContain('/admin/issuance-journal');
  expect(hrefs).toContain('/admin/licenses');
  expect(hrefs).toContain('/admin/webinars/settings');
});

it('nav: заглушки /mailings и /crm/deals скрыты из меню, но страницы доступны', () => {
  const hrefs = navigationModel.map((item) => item.href);
  expect(hrefs).not.toContain('/mailings');
  expect(hrefs).not.toContain('/crm/deals');
  // routeMeta сохранён — страницы достижимы по прямому URL
  expect(resolveRouteMeta('/mailings')).not.toBeNull();
  expect(resolveRouteMeta('/crm/deals')).not.toBeNull();
});

it('nav: латинские метки русифицированы', () => {
  const label = (href: string) => navigationModel.find((i) => i.href === href)?.label ?? '';
  expect(label('/student/dashboard')).toBe('Панель студента');
  expect(label('/teacher/grading-center')).toBe('Центр проверки работ');
  expect(label('/admin/cockpit')).toBe('Панель администратора');
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `pnpm --filter @trudskill/frontend exec vitest run src/features/navigation/helpers.test.ts --no-file-parallelism`
Expected: FAIL (сироты не резолвятся, метки латиница, заглушки ещё в меню).

- [ ] **Step 3: `model.ts` — добавить routeMeta для 2 сирот**

В `routeMeta` (массив до строки ~160, где `{ pattern: '/', ... }`), в кластер `/admin/*`, добавить (порядок среди `/admin/*` не важен — нет менее специфичного `/admin` префикса; главное — до записи `{ pattern: '/' }`):

```ts
  { pattern: '/admin/issuance-journal', meta: { public: false, requiredPermissions: ['tenant.read'] } },
  { pattern: '/admin/licenses', meta: { public: false, requiredPermissions: ['auth.manage_sessions'] } },
```

(`/admin/webinars/settings` уже есть в `routeMeta` — трогать не нужно.)

- [ ] **Step 4: `model.ts` — русифицировать 3 метки в `navigationModel`**

Строки 429-446, заменить `label`:

```ts
  {
    href: '/student/dashboard',
    label: 'Панель студента',
    requiredPermissions: ['enrollments.read'],
    navSlot: 'more'
  },
  {
    href: '/teacher/grading-center',
    label: 'Центр проверки работ',
    requiredPermissions: ['assessment.reviews.review'],
    navSlot: 'more'
  },
  {
    href: '/admin/cockpit',
    label: 'Панель администратора',
    requiredPermissions: ['auth.manage_sessions'],
    navSlot: 'more'
  },
```

- [ ] **Step 5: `model.ts` — удалить 2 nav-записи заглушек**

Удалить строку 393 (`/mailings`) и строку 395 (`/crm/deals`) из `navigationModel`. **`routeMeta` для них (строки 52, 23) НЕ трогать** — страницы остаются достижимы.

- [ ] **Step 6: `model.ts` — добавить 3 nav-записи сирот**

В конец `navigationModel` (после `/admin/proctoring-recordings`, строка 518, перед `];`) добавить:

```ts
  {
    href: '/admin/issuance-journal',
    label: 'Журнал выдачи',
    requiredPermissions: ['tenant.read'],
    navSlot: 'more'
  },
  {
    href: '/admin/webinars/settings',
    label: 'Настройки вебинаров',
    requiredPermissions: ['webinars.configure'],
    navSlot: 'more'
  },
  {
    href: '/admin/licenses',
    label: 'Лицензии',
    requiredPermissions: ['auth.manage_sessions'],
    navSlot: 'more'
  }
```

- [ ] **Step 7: Запустить тесты — зелёные**

Run: `pnpm --filter @trudskill/frontend exec vitest run src/features/navigation/helpers.test.ts --no-file-parallelism`
Expected: PASS (в т.ч. инвариант §5.154 — все 3 новые ссылки резолвятся в routeMeta).

- [ ] **Step 8: Прогнать весь фронтовый набор навигации — ничего не сломали**

Run: `pnpm --filter @trudskill/frontend exec vitest run src/features/navigation src/e2e --no-file-parallelism`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/frontend/src/features/navigation/model.ts apps/frontend/src/features/navigation/helpers.test.ts
git commit -m "feat(frontend): nav data — сироты в меню, скрыты заглушки, русификация меток (Фаза 2)"
```

---

## Task 2: Реестр иконок + модель групп + `getGroupedNavigation`

**Files:**

- Create: `apps/frontend/src/features/navigation/nav-icons.ts`
- Create: `apps/frontend/src/features/navigation/nav-groups.ts`
- Create (test): `apps/frontend/src/features/navigation/nav-groups.test.ts`

- [ ] **Step 1: Создать `nav-icons.ts` (курируемый реестр глифов)**

```ts
// Курируемый реестр иконок навигации — ЕДИНСТВЕННОЕ место в apps/frontend,
// где разрешён прямой импорт из lucide-react (см. eslint.config.mjs → no-restricted-imports).
// Все остальные модули импортируют готовые глифы отсюда и передают их в <Icon icon={...} /> из @trudskill/ui.
import {
  BarChart3,
  BookOpen,
  Building2,
  ChevronDown,
  ClipboardCheck,
  FileBadge,
  GraduationCap,
  LayoutDashboard,
  MessagesSquare,
  Search,
  Settings,
  Users
} from 'lucide-react';

import type { LucideIcon } from '@trudskill/ui';

// Иконки блоков навигации (10 блоков ИА).
export const LayoutDashboardIcon: LucideIcon = LayoutDashboard;
export const GraduationCapIcon: LucideIcon = GraduationCap;
export const BookOpenIcon: LucideIcon = BookOpen;
export const ClipboardCheckIcon: LucideIcon = ClipboardCheck;
export const UsersIcon: LucideIcon = Users;
export const Building2Icon: LucideIcon = Building2;
export const FileBadgeIcon: LucideIcon = FileBadge;
export const BarChart3Icon: LucideIcon = BarChart3;
export const MessagesSquareIcon: LucideIcon = MessagesSquare;
export const SettingsIcon: LucideIcon = Settings;

// Служебные иконки оболочки.
export const ChevronDownIcon: LucideIcon = ChevronDown;
export const SearchIcon: LucideIcon = Search;
```

- [ ] **Step 2: Проверить, что все имена глифов экспортируются установленной версией lucide-react**

Run: `pnpm --filter @trudskill/frontend exec tsc --noEmit -p tsconfig.json 2>&1 | grep -i "nav-icons" || echo "nav-icons: OK"`
Expected: `nav-icons: OK`. Если какой-то глиф не экспортится в `lucide-react@^1.23.0`, подобрать ближайший доступный и записать замену в deviations этого плана.

- [ ] **Step 3: Написать падающий тест `nav-groups.test.ts`**

```ts
import { describe, expect, it } from 'vitest';

import { navigationModel } from './model';
import { NAV_GROUPS, getGroupedNavigation, resolveGroupForPath } from './nav-groups';

import type { UserSession } from '../../entities/session/model';

const sessionWith = (permissions: string[]): UserSession => ({
  user: {
    id: 'u',
    tenantId: 't',
    login: 'l',
    email: null,
    status: 'active',
    displayName: 'U'
  },
  tokens: { accessToken: 'a', sessionId: 's', expiresIn: 300 },
  roles: [],
  permissions
});

describe('NAV_GROUPS', () => {
  it('ровно 10 блоков с уникальными id', () => {
    expect(NAV_GROUPS).toHaveLength(10);
    expect(new Set(NAV_GROUPS.map((g) => g.id)).size).toBe(10);
  });

  it('каждый пункт меню принадлежит ровно одному блоку (нет сирот и дублей)', () => {
    const membership = (href: string) =>
      NAV_GROUPS.filter((g) => g.hrefs.includes(href)).map((g) => g.id);
    const problems = navigationModel
      .map((item) => ({ href: item.href, groups: membership(item.href) }))
      .filter((row) => row.groups.length !== 1);
    expect(problems).toEqual([]);
  });
});

describe('getGroupedNavigation', () => {
  it('null-сессия → пустой массив групп', () => {
    expect(getGroupedNavigation(null)).toEqual([]);
  });

  it('пустые блоки (все пункты отфильтрованы правами) не рендерятся', () => {
    // только courses.read — виден лишь блок «Курсы и контент»
    const groups = getGroupedNavigation(sessionWith(['courses.read']));
    const ids = groups.map((g) => g.id);
    expect(ids).toContain('courses');
    expect(groups.every((g) => g.items.length > 0)).toBe(true);
    // без прав на людей блок «people» не появляется
    expect(ids).not.toContain('people');
  });

  it('порядок пунктов внутри блока следует порядку hrefs блока', () => {
    const groups = getGroupedNavigation(
      sessionWith(['courses.read', 'materials.read', 'directions.read', 'webinars.read'])
    );
    const courses = groups.find((g) => g.id === 'courses');
    expect(courses?.items.map((i) => i.href)).toEqual([
      '/courses',
      '/materials',
      '/scorm',
      '/directions',
      '/admin/webinars'
    ]);
  });
});

describe('resolveGroupForPath', () => {
  it('точный путь пункта → его блок', () => {
    expect(resolveGroupForPath('/courses')?.id).toBe('courses');
  });

  it('вложенный путь (деталь) → блок родителя по длиннейшему префиксу', () => {
    expect(resolveGroupForPath('/admin/tests/123')?.id).toBe('assessment');
  });

  it('длиннейший префикс побеждает: /academy/commission → documents, не settings', () => {
    expect(resolveGroupForPath('/academy/commission')?.id).toBe('documents');
    expect(resolveGroupForPath('/academy/requisites')?.id).toBe('settings');
  });

  it('неизвестный путь → null', () => {
    expect(resolveGroupForPath('/nope/here')).toBeNull();
  });
});
```

- [ ] **Step 4: Запустить — падает (нет модуля `nav-groups`)**

Run: `pnpm --filter @trudskill/frontend exec vitest run src/features/navigation/nav-groups.test.ts --no-file-parallelism`
Expected: FAIL (Cannot find module './nav-groups').

- [ ] **Step 5: Создать `nav-groups.ts`**

```ts
import { getVisibleNavigation } from './helpers';
import {
  BarChart3Icon,
  BookOpenIcon,
  Building2Icon,
  ClipboardCheckIcon,
  FileBadgeIcon,
  GraduationCapIcon,
  LayoutDashboardIcon,
  MessagesSquareIcon,
  SettingsIcon,
  UsersIcon
} from './nav-icons';

import type { LucideIcon } from '@trudskill/ui';
import type { UserSession } from '../../entities/session/model';
import type { NavigationItem } from './model';

/** Смысловой блок навигации (надстройка над RBAC — чистая презентация). */
export interface NavGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  /** hrefs пунктов блока в нужном порядке. Часть может не иметь пункта меню — это ок. */
  hrefs: string[];
}

/** Блок с уже отфильтрованными по правам пунктами (для рендера). */
export interface NavGroupView {
  id: string;
  label: string;
  icon: LucideIcon;
  items: NavigationItem[];
}

/** 10 блоков ИА (согласованы владельцем, Фаза 2). Порядок блоков и hrefs — как в ТЗ. */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'overview',
    label: 'Обзор',
    icon: LayoutDashboardIcon,
    hrefs: ['/', '/workspace', '/student/dashboard', '/learning/calendar', '/admin/cockpit']
  },
  {
    id: 'my-learning',
    label: 'Моё обучение',
    icon: GraduationCapIcon,
    hrefs: [
      '/learner',
      '/learner/courses',
      '/learner/tests',
      '/learner/assignments',
      '/learner/webinars',
      '/learner/payments',
      '/learner/identity'
    ]
  },
  {
    id: 'courses',
    label: 'Курсы и контент',
    icon: BookOpenIcon,
    hrefs: ['/courses', '/materials', '/scorm', '/directions', '/admin/webinars']
  },
  {
    id: 'assessment',
    label: 'Проверка и оценивание',
    icon: ClipboardCheckIcon,
    hrefs: [
      '/assessment',
      '/admin/tests',
      '/admin/question-banks',
      '/question-import',
      '/admin/assignments',
      '/teacher/review',
      '/teacher/grading-center',
      '/proctoring',
      '/admin/proctoring-recordings',
      '/admin/identity-verifications'
    ]
  },
  {
    id: 'people',
    label: 'Люди и группы',
    icon: UsersIcon,
    hrefs: ['/learners', '/admin/learners', '/groups', '/admin/bulk-enrollments']
  },
  {
    id: 'clients',
    label: 'Клиенты и продажи',
    icon: Building2Icon,
    hrefs: ['/counterparties', '/admin/clients', '/counterparty-portal', '/admin/orders']
  },
  {
    id: 'documents',
    label: 'Документы и удостоверения',
    icon: FileBadgeIcon,
    hrefs: [
      '/documents',
      '/learner/documents',
      '/admin/issuance-journal',
      '/admin/commissions',
      '/admin/recertification',
      '/esign/applications',
      '/esign/processes',
      '/esign/legal-log',
      '/academy/commission'
    ]
  },
  {
    id: 'reports',
    label: 'Отчёты и выгрузки',
    icon: BarChart3Icon,
    hrefs: [
      '/reports',
      '/admin/analytics',
      '/admin/reports/builder',
      '/gov-export',
      '/exports',
      '/registry',
      '/audit'
    ]
  },
  {
    id: 'communications',
    label: 'Коммуникации',
    icon: MessagesSquareIcon,
    hrefs: ['/notifications', '/chat', '/admin/notification-settings']
  },
  {
    id: 'settings',
    label: 'Настройки и система',
    icon: SettingsIcon,
    hrefs: [
      '/settings',
      '/users',
      '/integrations',
      '/sync-logs',
      '/academy',
      '/academy/requisites',
      '/telephony',
      '/admin/payments/settings',
      '/admin/webinars/settings',
      '/admin/licenses'
    ]
  }
];

const normalizePath = (path: string) => {
  const withoutQuery = path.split('?')[0] ?? '/';
  if (withoutQuery === '/') return '/';
  return withoutQuery.replace(/\/+$/, '') || '/';
};

/**
 * Раскладывает видимые (по правам) пункты меню по блокам.
 * Надстройка над RBAC: источник — getVisibleNavigation (правами не управляем).
 * Пустые блоки отбрасываются. Порядок пунктов — по group.hrefs.
 */
export const getGroupedNavigation = (session: UserSession | null): NavGroupView[] => {
  const visible = getVisibleNavigation(session);
  const byHref = new Map(visible.map((item) => [item.href, item]));
  return NAV_GROUPS.map((group) => ({
    id: group.id,
    label: group.label,
    icon: group.icon,
    items: group.hrefs
      .map((href) => byHref.get(href))
      .filter((item): item is NavigationItem => Boolean(item))
  })).filter((group) => group.items.length > 0);
};

/**
 * Определяет блок для произвольного пути (для хлебных крошек).
 * Длиннейший префикс-матч среди всех group.hrefs; '/' матчит только сам корень.
 */
export const resolveGroupForPath = (pathname: string): NavGroup | null => {
  const normalized = normalizePath(pathname);
  let best: { group: NavGroup; len: number } | null = null;
  for (const group of NAV_GROUPS) {
    for (const href of group.hrefs) {
      const isMatch = normalized === href || (href !== '/' && normalized.startsWith(`${href}/`));
      if (isMatch && (!best || href.length > best.len)) {
        best = { group, len: href.length };
      }
    }
  }
  return best?.group ?? null;
};
```

- [ ] **Step 6: Запустить — зелёные**

Run: `pnpm --filter @trudskill/frontend exec vitest run src/features/navigation/nav-groups.test.ts --no-file-parallelism`
Expected: PASS. Если тест «каждый пункт в ровно одном блоке» падает — значит какой-то href в `navigationModel` не покрыт (или покрыт дважды): исправить `NAV_GROUPS.hrefs`, НЕ ослаблять тест.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/features/navigation/nav-icons.ts apps/frontend/src/features/navigation/nav-groups.ts apps/frontend/src/features/navigation/nav-groups.test.ts
git commit -m "feat(frontend): модель 10 блоков навигации + getGroupedNavigation (Фаза 2)"
```

---

## Task 3: ESLint — запрет прямого импорта `lucide-react` во фронтенде

**Files:**

- Modify: `eslint.config.mjs`

- [ ] **Step 1: Добавить `no-restricted-imports` во frontend-блок**

Заменить блок (строки 54-62):

```js
  {
    files: ['apps/frontend/**/*.{ts,tsx,js,jsx}'],
    plugins: {
      '@next/next': nextPlugin
    },
    rules: {
      '@next/next/no-img-element': 'warn'
    }
  },
```

на:

```js
  {
    files: ['apps/frontend/**/*.{ts,tsx,js,jsx}'],
    plugins: {
      '@next/next': nextPlugin
    },
    rules: {
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
```

- [ ] **Step 2: Проверить — правило ловит нарушение, `nav-icons.ts` чист**

Run: `npx eslint apps/frontend/src/features/navigation/nav-icons.ts --max-warnings=0`
Expected: PASS (0 ошибок — исключение работает).

Проверка, что правило реально запрещает (создать временный файл, убедиться в ошибке, удалить):

```bash
printf "import { Home } from 'lucide-react';\nexport const x = Home;\n" > apps/frontend/src/features/navigation/__lint_probe.ts
npx eslint apps/frontend/src/features/navigation/__lint_probe.ts 2>&1 | grep -q "lucide-react" && echo "RULE OK" || echo "RULE MISSING"
rm apps/frontend/src/features/navigation/__lint_probe.ts
```

Expected: `RULE OK`.

- [ ] **Step 3: Полный lint фронтенда (0 нарушений — прямых импортов lucide во фронте нет)**

Run: `pnpm lint --filter @trudskill/frontend` (или `npx eslint "apps/frontend/src/**/*.{ts,tsx}" --max-warnings=0`)
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add eslint.config.mjs
git commit -m "chore(frontend): ESLint запрет прямого lucide-react + исключение nav-icons (Фаза 2)"
```

---

## Task 4: Сгруппированный сайдбар в `app-shell.tsx`

**Files:**

- Modify: `apps/frontend/src/widgets/shell/app-shell.tsx`

Цель: заменить `navView.main` + `<details>` «Еще разделы» на 10 сворачиваемых блоков. Блок с активным пунктом раскрыт автоматически. Заголовок блока — кнопка (`Icon` + название + шеврон), `aria-expanded`, `aria-controls`. Активный пункт — `aria-current="page"`. Роль, мобильный drawer, skip-link, топбар с live-region — сохранить. `prefers-reduced-motion` — уважать.

> Палитра (Task 5) и рендер крошек-блоков (Task 6) допишутся в этот же файл в своих задачах. В Task 4 — только сайдбар. Импорты палитры добавятся в Task 5.

- [ ] **Step 1: Переписать `app-shell.tsx` (сайдбар-часть)**

Заменить импорты (строки 1-12) на:

```tsx
'use client';

import { Icon, VISUALLY_HIDDEN_CLASS } from '@trudskill/ui';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type PropsWithChildren, useEffect, useMemo, useState } from 'react';

import { useAuth } from '../../features/auth/context';
import { useNotificationsList, useNotificationsRealtime } from '../../features/communication/hooks';
import { buildBreadcrumbs } from '../../features/navigation/breadcrumbs';
import { getGroupedNavigation } from '../../features/navigation/nav-groups';
import { ChevronDownIcon } from '../../features/navigation/nav-icons';
import { getPrimaryRoleBlueprint } from '../../features/navigation/role-blueprints';
```

Заменить тело хука (строки 22-36) — вычислить группы и активный блок, состояние раскрытия:

```tsx
const pathname = usePathname();
const { session, logout } = useAuth();
const groups = getGroupedNavigation(session);
const primaryRole = getPrimaryRoleBlueprint(session);
const breadcrumbItems = useMemo(() => buildBreadcrumbs(pathname), [pathname]);
const unread = useNotificationsList(1, 1, 'unread');
const [mobileNavOpen, setMobileNavOpen] = useState(false);

const isItemActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

// id блока, содержащего активный пункт (для авто-раскрытия).
const activeGroupId = useMemo(() => {
  const hit = groups.find((group) => group.items.some((item) => isItemActive(item.href)));
  return hit?.id ?? null;
  // pathname меняется вместе с активностью; groups стабильны по составу для сессии.
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [pathname, groups.length]);

// Состояние «раскрыт ли блок». Активный блок раскрыт по умолчанию.
const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

useNotificationsRealtime(() => void unread.refetch());

useEffect(() => {
  setMobileNavOpen(false);
}, [pathname]);

// Гарантируем: блок с активной страницей всегда раскрыт (не схлопываем ручные раскрытия).
useEffect(() => {
  if (activeGroupId) {
    setOpenGroups((prev) => (prev[activeGroupId] ? prev : { ...prev, [activeGroupId]: true }));
  }
}, [activeGroupId]);

const isGroupOpen = (id: string) => openGroups[id] ?? id === activeGroupId;
const toggleGroup = (id: string) =>
  setOpenGroups((prev) => ({ ...prev, [id]: !(prev[id] ?? id === activeGroupId) }));

const unreadLabel = formatUnreadBadge(unread.data?.total);
```

Заменить `<nav>` сайдбара (строки 68-102) на сгруппированный рендер:

```tsx
<nav className="app-shell__nav" aria-label="Основные разделы">
  {groups.map((group) => {
    const open = isGroupOpen(group.id);
    const regionId = `nav-group-${group.id}`;
    return (
      <div className="app-shell__group" key={group.id}>
        <button
          type="button"
          className="app-shell__group-header"
          aria-expanded={open}
          aria-controls={regionId}
          onClick={() => toggleGroup(group.id)}
        >
          <Icon icon={group.icon} size={20} />
          <span className="app-shell__group-title">{group.label}</span>
          <span className={`app-shell__chevron ${open ? 'is-open' : ''}`}>
            <Icon icon={ChevronDownIcon} size={16} />
          </span>
        </button>
        <div id={regionId} className="app-shell__group-items ui-stack" hidden={!open}>
          {group.items.map((item) => {
            const active = isItemActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`app-shell__link ${active ? 'is-active' : ''}`}
                aria-current={active ? 'page' : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      </div>
    );
  })}
</nav>
```

- [ ] **Step 2: Обновить `<style jsx>` — стили блоков + reduced-motion**

Удалить более неиспользуемые правила `.app-shell__more`, `.app-shell__more > summary`, `.app-shell__link--more` (селекторы больше не рендерятся). Добавить в блок `<style jsx>` (рядом с `.app-shell__link`):

```css
.app-shell__nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.app-shell__group {
  display: flex;
  flex-direction: column;
}
.app-shell__group-header {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  background: transparent;
  border-radius: 10px;
  color: var(--ui-nav-text, var(--ui-text));
  font-weight: 700;
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  cursor: pointer;
}
.app-shell__group-header:hover {
  background: var(--ui-nav-hover-bg, var(--ui-surface-muted));
}
.app-shell__group-title {
  flex: 1 1 auto;
  text-align: left;
}
.app-shell__chevron {
  display: inline-flex;
  color: var(--ui-nav-text-muted, var(--ui-text-muted));
  transition: transform 0.18s ease;
}
.app-shell__chevron.is-open {
  transform: rotate(180deg);
}
.app-shell__group-items {
  gap: 2px;
  padding: 2px 0 6px 12px;
}
@media (prefers-reduced-motion: reduce) {
  .app-shell__chevron {
    transition: none;
  }
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @trudskill/frontend exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Существующие e2e (роутинг/видимость — по href) не сломаны**

Run: `pnpm --filter @trudskill/frontend exec vitest run src/e2e src/features/navigation --no-file-parallelism`
Expected: PASS (тесты проверяют `getVisibleNavigation`/`evaluateRouteAccess` — их мы не меняли).

- [ ] **Step 5: Смоук-проверка в браузере (превью) — сайдбар и логин**

Через preview\_\* (dev-сервер фронтенда): открыть `/` под сессией, убедиться:

- видно 10 блоков (или подмножество по правам), активный блок раскрыт;
- заголовок блока фокусируется с клавиатуры, Enter/Space сворачивает-разворачивает, шеврон поворачивается;
- активный пункт подсвечен (`is-active`);
- открыть страницу логина `/login` — кнопки ЕСИА/вход остаются честными 40px-кнопками (known issue Фазы 1), верстка цела.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/widgets/shell/app-shell.tsx
git commit -m "feat(frontend): сгруппированный сайдбар — 10 сворачиваемых блоков (Фаза 2)"
```

---

## Task 5: Командная палитра Ctrl/⌘+K

**Files:**

- Create: `apps/frontend/src/features/navigation/command-palette.ts` (чистая логика)
- Create (test): `apps/frontend/src/features/navigation/command-palette.test.ts`
- Create: `apps/frontend/src/widgets/shell/command-palette.tsx` (компонент)
- Modify: `apps/frontend/src/widgets/shell/app-shell.tsx` (монтирование + Ctrl/⌘+K + кнопка «Поиск»)

- [ ] **Step 1: Падающий тест чистой логики `command-palette.test.ts`**

```ts
import { describe, expect, it } from 'vitest';

import { buildCommandItems, filterCommands, type CommandItem } from './command-palette';

import type { UserSession } from '../../entities/session/model';

const items: CommandItem[] = [
  { href: '/courses', label: 'Курсы', group: 'Курсы и контент' },
  { href: '/audit', label: 'Аудит', group: 'Отчёты и выгрузки' },
  { href: '/groups', label: 'Группы', group: 'Люди и группы' }
];

describe('filterCommands', () => {
  it('пустой запрос → все пункты', () => {
    expect(filterCommands(items, '')).toEqual(items);
    expect(filterCommands(items, '   ')).toEqual(items);
  });

  it('матч по подстроке метки без учёта регистра', () => {
    expect(filterCommands(items, 'кур').map((i) => i.href)).toEqual(['/courses']);
    expect(filterCommands(items, 'ГРУП').map((i) => i.href)).toEqual(['/groups']);
  });

  it('матч по href', () => {
    expect(filterCommands(items, '/audit').map((i) => i.href)).toEqual(['/audit']);
  });

  it('матч по названию блока', () => {
    expect(filterCommands(items, 'отчёты').map((i) => i.href)).toEqual(['/audit']);
  });

  it('нет совпадений → пустой массив', () => {
    expect(filterCommands(items, 'zzz')).toEqual([]);
  });
});

describe('buildCommandItems', () => {
  const session = (permissions: string[]): UserSession => ({
    user: { id: 'u', tenantId: 't', login: 'l', email: null, status: 'active', displayName: 'U' },
    tokens: { accessToken: 'a', sessionId: 's', expiresIn: 300 },
    roles: [],
    permissions
  });

  it('источник — только доступные по правам страницы, с ярлыком блока', () => {
    const built = buildCommandItems(session(['courses.read']));
    const courses = built.find((i) => i.href === '/courses');
    expect(courses).toBeDefined();
    expect(courses?.group).toBe('Курсы и контент');
    expect(built.some((i) => i.href === '/audit')).toBe(false);
  });

  it('null-сессия → пусто', () => {
    expect(buildCommandItems(null)).toEqual([]);
  });
});
```

- [ ] **Step 2: Запустить — падает**

Run: `pnpm --filter @trudskill/frontend exec vitest run src/features/navigation/command-palette.test.ts --no-file-parallelism`
Expected: FAIL (нет модуля).

- [ ] **Step 3: Создать `command-palette.ts`**

```ts
import { getVisibleNavigation } from './helpers';
import { NAV_GROUPS } from './nav-groups';

import type { UserSession } from '../../entities/session/model';

/** Пункт быстрого перехода в палитре. */
export interface CommandItem {
  href: string;
  label: string;
  /** Ярлык блока — для контекста в списке. */
  group?: string;
}

// href → метка блока (первое вхождение). Строится один раз.
const groupLabelByHref = new Map<string, string>();
for (const group of NAV_GROUPS) {
  for (const href of group.hrefs) {
    if (!groupLabelByHref.has(href)) groupLabelByHref.set(href, group.label);
  }
}

/** Фильтр по подстроке (метка/href/блок), регистронезависимый. Пустой запрос → все. */
export const filterCommands = (items: CommandItem[], query: string): CommandItem[] => {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter(
    (item) =>
      item.label.toLowerCase().includes(q) ||
      item.href.toLowerCase().includes(q) ||
      (item.group?.toLowerCase().includes(q) ?? false)
  );
};

/** Все доступные пользователю страницы (после RBAC-фильтра) как команды. */
export const buildCommandItems = (session: UserSession | null): CommandItem[] =>
  getVisibleNavigation(session).map((item) => {
    const group = groupLabelByHref.get(item.href);
    // exactOptionalPropertyTypes: group добавляем только если есть.
    return group
      ? { href: item.href, label: item.label, group }
      : { href: item.href, label: item.label };
  });
```

- [ ] **Step 4: Запустить — зелёные**

Run: `pnpm --filter @trudskill/frontend exec vitest run src/features/navigation/command-palette.test.ts --no-file-parallelism`
Expected: PASS.

- [ ] **Step 5: Создать компонент `widgets/shell/command-palette.tsx`**

```tsx
'use client';

import { Icon } from '@trudskill/ui';
import { useRouter } from 'next/navigation';
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';

import { filterCommands, type CommandItem } from '../../features/navigation/command-palette';
import { SearchIcon } from '../../features/navigation/nav-icons';

interface CommandPaletteProps {
  open: boolean;
  items: CommandItem[];
  onClose: () => void;
}

export const CommandPalette = ({ open, items, onClose }: CommandPaletteProps) => {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const results = useMemo(() => filterCommands(items, query), [items, query]);

  // Сброс и автофокус при каждом открытии.
  useEffect(() => {
    if (!open) return undefined;
    setQuery('');
    setActiveIndex(0);
    const raf = window.requestAnimationFrame(() => inputRef.current?.focus());
    return () => window.cancelAnimationFrame(raf);
  }, [open]);

  // Держим активный индекс в границах.
  useEffect(() => {
    setActiveIndex((i) => (results.length === 0 ? 0 : Math.min(i, results.length - 1)));
  }, [results.length]);

  if (!open) return null;

  const commit = (item: CommandItem | undefined) => {
    if (!item) return;
    onClose();
    router.push(item.href);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => (results.length ? (i + 1) % results.length : 0));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => (results.length ? (i - 1 + results.length) % results.length : 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      commit(results[activeIndex]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
    }
  };

  const activeId = results[activeIndex] ? `cmd-opt-${activeIndex}` : undefined;

  return (
    <div
      className="cmdk"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="cmdk__dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Быстрый переход по разделам"
      >
        <div className="cmdk__input-row">
          <Icon icon={SearchIcon} size={18} />
          <input
            ref={inputRef}
            className="cmdk__input"
            type="text"
            role="combobox"
            aria-expanded="true"
            aria-controls="cmdk-listbox"
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            placeholder="Поиск раздела…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
          />
        </div>
        <ul className="cmdk__list" id="cmdk-listbox" role="listbox" aria-label="Разделы">
          {results.length === 0 ? (
            <li className="cmdk__empty">Ничего не найдено</li>
          ) : (
            results.map((item, index) => (
              <li
                key={item.href}
                id={`cmd-opt-${index}`}
                role="option"
                aria-selected={index === activeIndex}
                className={`cmdk__option ${index === activeIndex ? 'is-active' : ''}`}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => commit(item)}
              >
                <span className="cmdk__option-label">{item.label}</span>
                {item.group ? <span className="cmdk__option-group">{item.group}</span> : null}
              </li>
            ))
          )}
        </ul>
      </div>
      <style jsx>{`
        .cmdk {
          position: fixed;
          inset: 0;
          z-index: 13000;
          background: rgba(15, 23, 42, 0.45);
          display: flex;
          justify-content: center;
          align-items: flex-start;
          padding-top: 12vh;
        }
        .cmdk__dialog {
          width: min(560px, 92vw);
          background: var(--ui-surface);
          border: 1px solid var(--ui-border);
          border-radius: 14px;
          box-shadow: var(--ui-shadow-strong);
          overflow: hidden;
        }
        .cmdk__input-row {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 14px 16px;
          border-bottom: 1px solid var(--ui-border);
          color: var(--ui-text-muted);
        }
        .cmdk__input {
          flex: 1 1 auto;
          border: none;
          outline: none;
          background: transparent;
          font-size: 16px;
          color: var(--ui-text);
        }
        .cmdk__list {
          list-style: none;
          margin: 0;
          padding: 6px;
          max-height: 52vh;
          overflow-y: auto;
        }
        .cmdk__option {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 12px;
          padding: 10px 12px;
          border-radius: 10px;
          cursor: pointer;
          color: var(--ui-text);
        }
        .cmdk__option.is-active {
          background: var(--ui-nav-active-bg, var(--ui-surface-muted));
          color: var(--ui-nav-active-text, var(--ui-brand-700));
        }
        .cmdk__option-group {
          font-size: 12px;
          color: var(--ui-text-muted);
          white-space: nowrap;
        }
        .cmdk__empty {
          padding: 16px 12px;
          color: var(--ui-text-muted);
          text-align: center;
        }
      `}</style>
    </div>
  );
};
```

- [ ] **Step 6: Смонтировать палитру в `app-shell.tsx` + Ctrl/⌘+K + кнопка «Поиск»**

Дополнить импорты `app-shell.tsx`:

```tsx
import { type PropsWithChildren, useCallback, useEffect, useMemo, useRef, useState } from 'react';
// ...
import { CommandPalette } from './command-palette';
import { buildCommandItems } from '../../features/navigation/command-palette';
import { ChevronDownIcon, SearchIcon } from '../../features/navigation/nav-icons';
```

Добавить в тело хука (рядом с прочими useState):

```tsx
const [paletteOpen, setPaletteOpen] = useState(false);
const paletteReturnRef = useRef<HTMLElement | null>(null);
const commandItems = useMemo(() => buildCommandItems(session), [session]);

const openPalette = useCallback(() => {
  paletteReturnRef.current = (document.activeElement as HTMLElement) ?? null;
  setPaletteOpen(true);
}, []);

const closePalette = useCallback(() => {
  setPaletteOpen(false);
  // Фокус возвращается на место вызова.
  paletteReturnRef.current?.focus();
}, []);

// Глобальный Ctrl/⌘+K.
useEffect(() => {
  const onKey = (event: globalThis.KeyboardEvent) => {
    if ((event.metaKey || event.ctrlKey) && (event.key === 'k' || event.key === 'K')) {
      event.preventDefault();
      setPaletteOpen((prev) => {
        if (!prev) paletteReturnRef.current = (document.activeElement as HTMLElement) ?? null;
        return !prev;
      });
    }
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}, []);
```

В топбар (`app-shell__userbar`, перед ссылкой «Уведомления») добавить кнопку:

```tsx
<button
  type="button"
  className="app-shell__search"
  onClick={openPalette}
  aria-keyshortcuts="Control+K Meta+K"
>
  <Icon icon={SearchIcon} size={16} />
  <span>Поиск</span>
  <kbd className="app-shell__kbd">Ctrl K</kbd>
</button>
```

Смонтировать палитру перед закрывающим `</div>` корня (после `app-shell__content`):

```tsx
<CommandPalette open={paletteOpen} items={commandItems} onClose={closePalette} />
```

Добавить стили в `<style jsx>`:

```css
.app-shell__search {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 10px;
  border: 1px solid var(--ui-border);
  border-radius: 10px;
  background: var(--ui-surface);
  color: var(--ui-text-muted);
  cursor: pointer;
  font-size: 13px;
}
.app-shell__search:hover {
  color: var(--ui-text);
}
.app-shell__kbd {
  font-size: 11px;
  border: 1px solid var(--ui-border);
  border-radius: 6px;
  padding: 1px 5px;
  color: var(--ui-text-muted);
}
```

- [ ] **Step 7: Smoke-тест `e2e/navigation-shell.e2e.test.ts`**

```ts
import { describe, expect, it } from 'vitest';

describe('navigation shell modules', () => {
  it('AppShell импортируется без ошибок', async () => {
    const mod = await import('../widgets/shell/app-shell');
    expect(typeof mod.AppShell).toBe('function');
  });

  it('CommandPalette импортируется без ошибок', async () => {
    const mod = await import('../widgets/shell/command-palette');
    expect(typeof mod.CommandPalette).toBe('function');
  });
});
```

- [ ] **Step 8: Typecheck + тесты + smoke**

Run: `pnpm --filter @trudskill/frontend exec tsc --noEmit`
Run: `pnpm --filter @trudskill/frontend exec vitest run src/features/navigation/command-palette.test.ts src/e2e/navigation-shell.e2e.test.ts --no-file-parallelism`
Expected: PASS.

- [ ] **Step 9: Клавиатурная проверка в превью**

Ctrl+K открывает палитру, фокус в поле; ввод фильтрует; ↑/↓ двигают выделение (aria-activedescendant), Enter переходит, Escape закрывает и возвращает фокус на кнопку «Поиск» / место вызова.

- [ ] **Step 10: Commit**

```bash
git add apps/frontend/src/features/navigation/command-palette.ts apps/frontend/src/features/navigation/command-palette.test.ts apps/frontend/src/widgets/shell/command-palette.tsx apps/frontend/src/widgets/shell/app-shell.tsx apps/frontend/src/e2e/navigation-shell.e2e.test.ts
git commit -m "feat(frontend): командная палитра Ctrl/⌘+K (Фаза 2)"
```

---

## Task 6: Хлебные крошки — иерархия «Блок → Страница → Деталь»

**Files:**

- Modify: `apps/frontend/src/features/navigation/breadcrumbs.ts`
- Modify (test): `apps/frontend/src/features/navigation/breadcrumbs.test.ts`
- Modify: `apps/frontend/src/widgets/shell/app-shell.tsx` (рендер крошек с опциональным href)

- [ ] **Step 1: Обновить тесты `breadcrumbs.test.ts`**

Заменить тест «uses navigation labels for known paths» и «builds nested path with segment fallbacks», добавить крошку-блок:

```ts
it('uses navigation labels for known paths (with block crumb)', () => {
  expect(buildBreadcrumbs('/courses')).toEqual([
    { label: 'Главная', href: '/' },
    { label: 'Курсы и контент' },
    { label: 'Курсы', href: '/courses' }
  ]);
});

it('builds nested path with block + segment fallbacks', () => {
  const crumbs = buildBreadcrumbs('/courses/new');
  expect(crumbs[0]).toEqual({ label: 'Главная', href: '/' });
  expect(crumbs[1]).toEqual({ label: 'Курсы и контент' });
  expect(crumbs[2]).toEqual({ label: 'Курсы', href: '/courses' });
  expect(crumbs[3]).toEqual({ label: 'Создание', href: '/courses/new' });
});

it('inserts non-navigable block crumb (no href) as second item', () => {
  const crumbs = buildBreadcrumbs('/admin/tests/42');
  expect(crumbs[1]).toEqual({ label: 'Проверка и оценивание' });
  expect(crumbs[1].href).toBeUndefined();
});
```

(Тесты «returns single crumb for home» и «labels UUID-like last segment as card» остаются — они проверяют `crumbs[0]` / `crumbs.at(-1)`, крошка-блок между ними их не ломает.)

- [ ] **Step 2: Запустить — падает**

Run: `pnpm --filter @trudskill/frontend exec vitest run src/features/navigation/breadcrumbs.test.ts --no-file-parallelism`
Expected: FAIL (нет крошки-блока, `href` обязателен).

- [ ] **Step 3: Обновить `breadcrumbs.ts`**

Добавить импорт вверху (после `import { navigationModel } from './model';`):

```ts
import { resolveGroupForPath } from './nav-groups';
```

Сделать `href` опциональным в типе:

```ts
export type BreadcrumbItem = { label: string; href?: string };
```

Заменить тело `buildBreadcrumbs` на:

```ts
export const buildBreadcrumbs = (pathname: string): BreadcrumbItem[] => {
  const normalized = (pathname.split('?')[0] ?? '/').replace(/\/+$/, '') || '/';
  if (normalized === '/') {
    return [{ label: 'Главная', href: '/' }];
  }

  const items: BreadcrumbItem[] = [{ label: 'Главная', href: '/' }];

  // Крошка блока (раздел меню) — ненавигационная: Блок → Страница → Деталь.
  const group = resolveGroupForPath(normalized);
  if (group) {
    items.push({ label: group.label });
  }

  const segments = normalized.split('/').filter(Boolean);
  let acc = '';
  for (let i = 0; i < segments.length; i++) {
    acc += `/${segments[i]}`;
    const fromNav = hrefToLabel.get(acc);
    const isLast = i === segments.length - 1;
    const label = fromNav ?? labelForSegment(segments[i] ?? '', isLast);
    items.push({ label, href: acc });
  }

  return items;
};
```

- [ ] **Step 4: Обновить рендер крошек в `app-shell.tsx`**

Заменить `.map` крошек (строки 107-121) на вариант с опциональным href:

```tsx
{
  breadcrumbItems.map((crumb, index) => {
    const isLast = index === breadcrumbItems.length - 1;
    return (
      <span key={`${index}-${crumb.label}`} className="app-shell__crumb">
        {index > 0 ? <span className="app-shell__crumb-sep"> / </span> : null}
        {isLast || !crumb.href ? (
          <span className={isLast ? 'app-shell__crumb-current' : 'app-shell__crumb-block'}>
            {crumb.label}
          </span>
        ) : (
          <Link href={crumb.href} className="app-shell__crumb-link">
            {crumb.label}
          </Link>
        )}
      </span>
    );
  });
}
```

Добавить стиль крошки-блока в `<style jsx>` (рядом с `.app-shell__crumb-current`):

```css
.app-shell__crumb-block {
  color: var(--ui-text-muted);
  font-weight: 500;
}
```

- [ ] **Step 5: Тесты + typecheck**

Run: `pnpm --filter @trudskill/frontend exec vitest run src/features/navigation/breadcrumbs.test.ts --no-file-parallelism`
Run: `pnpm --filter @trudskill/frontend exec tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/features/navigation/breadcrumbs.ts apps/frontend/src/features/navigation/breadcrumbs.test.ts apps/frontend/src/widgets/shell/app-shell.tsx
git commit -m "feat(frontend): крошки с иерархией блоков (Блок → Страница → Деталь) (Фаза 2)"
```

---

## Task 7: Топбар — аккуратное оформление, полная верификация, документация

**Files:**

- Modify: `apps/frontend/src/widgets/shell/app-shell.tsx` (лёгкая полировка топбара)
- Modify: `README.md` (§2 AI Agent State)
- Modify: `LMS_AGENT_HANDOFF.md` (§5.163)
- Modify: `docs/superpowers/plans/2026-07-02-ui-redesign-phase-2-navigation.md` (галочки)

- [ ] **Step 1: Лёгкая полировка топбара (без изменения поведения live-region)**

В `<style jsx>` слегка выровнять топбар (только визуал; `role="status" aria-live="polite"` счётчика уведомлений НЕ трогать):

```css
.app-shell__userbar {
  gap: 12px;
}
```

(Оставить существующую разметку `app-shell__notif-link` / live-region дословно.)

- [ ] **Step 2: Полный фронтовый прогон**

Run: `pnpm --filter @trudskill/frontend exec vitest run --no-file-parallelism`
Expected: PASS (все ~190+ тестов).

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm --filter @trudskill/frontend exec tsc --noEmit`
Run: `npx eslint "apps/frontend/src/**/*.{ts,tsx}" --max-warnings=0`
Expected: PASS.

- [ ] **Step 4: Верификация a11y/поведения в превью (свести воедино)**

- Сайдбар: 10 блоков, у роли — только её пункты, активный блок раскрыт, `aria-expanded`/`aria-current` корректны, клавиатура работает.
- Палитра: Ctrl/⌘+K полностью с клавиатуры, фокус возвращается.
- Крошки: Блок → Страница → Деталь; крошка-блок — текст, не ссылка.
- Мобильный drawer (ширина ≤1024px): открытие/закрытие/бэкдроп/закрытие по навигации.
- `prefers-reduced-motion`: шеврон не анимируется.
- Скринридер: счётчик уведомлений (live-region) сохранён.
- Логин-страница: кнопки 40px, верстка цела.

- [ ] **Step 5: Документация — README §2 + handoff §5.163 + галочки плана**

`README.md` §2 «AI Agent State»: Current/Last/Next Task, Last Updated At/By (2026-07-02).

`LMS_AGENT_HANDOFF.md` — добавить `### 5.163 UI redesign Фаза 2 — навигация и оболочка`: summary, изменённые файлы, статус тестов, deviations (в т.ч. реальные имена глифов lucide, если отличались; сохранение `getNavigationView` как legacy).

Отметить галочки в этом плане.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/widgets/shell/app-shell.tsx README.md LMS_AGENT_HANDOFF.md docs/superpowers/plans/2026-07-02-ui-redesign-phase-2-navigation.md
git commit -m "docs(frontend): топбар-полировка + README/handoff §5.163 (Фаза 2)"
```

---

## Self-Review (проведён при написании плана)

**Покрытие требований промта:**

- A. Сгруппированный сайдбар (10 блоков, авто-раскрытие активного, `aria-expanded`/`aria-current`, роль, мобильный drawer, reduced-motion) → Task 2 + Task 4. ✅
- B. Палитра Ctrl/⌘+K (источник — `getVisibleNavigation` после RBAC, подстрока, стрелки/Enter/Escape, combobox/listbox + `aria-activedescendant`, возврат фокуса, без внешних либ) → Task 5. ✅
- C. Крошки — иерархия блоков → Task 6. ✅
- D. Топбар аккуратно, live-region сохранён → Task 7. ✅
- Сироты в меню + routeMeta (`/admin/licenses`, `/admin/issuance-journal`, `/admin/webinars/settings`) → Task 1. ✅
- Скрыть заглушки (`/forms` уже вне меню; `/crm/deals`, `/mailings` убрать) → Task 1. ✅
- Русификация 3 меток → Task 1. ✅
- Иконки только через `Icon` + ESLint `no-restricted-imports` на `lucide-react` → Task 2 (nav-icons) + Task 3. ✅
- Инвариант «каждая nav-ссылка резолвится в routeMeta» соблюдён (новые пункты имеют routeMeta) + новый инвариант «каждый пункт в ровно одном блоке» → Task 1 + Task 2. ✅

**Жёсткие ограничения:**

- URL не ломаем, страницы не переносим, RBAC-семантика неизменна (группы — презентация над `getVisibleNavigation`). ✅
- `pnpm test:frontend` + typecheck зелёные (шаги в каждой задаче). ✅
- a11y: skip-link, focus-visible, `aria-expanded`/`aria-current`, клавиатура палитры, live-region — сохранены/усилены. ✅
- Бэкенд/контракты/миграции не трогаем. ✅

**Type consistency:** `NavGroup`/`NavGroupView`, `CommandItem`, `BreadcrumbItem` (`href?`), `getGroupedNavigation`/`resolveGroupForPath`/`buildCommandItems`/`filterCommands` — имена согласованы между задачами. `LucideIcon` — из `@trudskill/ui`.

**Риски / открытые вопросы:**

- Имена глифов lucide (`FileBadge`, `BarChart3`, `Building2`, `MessagesSquare`, `ClipboardCheck`) в `lucide-react@^1.23.0` — проверяются typecheck'ом (Task 2 Step 2); при отсутствии подобрать ближайший и записать в deviations.
- `getNavigationView` + его тест остаются как legacy (D4) — помечены комментарием, удаление отложено.
