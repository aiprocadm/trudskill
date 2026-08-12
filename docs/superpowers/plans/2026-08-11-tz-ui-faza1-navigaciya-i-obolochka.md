# Фаза 1 «Навигация и оболочка» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Администратор после входа видит **7 пунктов меню вместо 70**, при этом ни один из 102 маршрутов не становится недостижимым — всё остальное уезжает в «Ещё» и в палитру `Ctrl+K`.

**Architecture:** Информационная архитектура разделяется на два слоя. **Разбиение** — 10 блоков ИА в `nav-groups.ts`, покрывают все маршруты, не меняются, охраняются `ia-architecture.e2e.test.ts`. **Видимость** — что показывается сразу, собирается уже написанной `getNavigationView` из `primaryNav` роли. Работа Фазы 1 — подключить второй слой к оболочке, задать корректные `primaryNav` и вынести 288 строк CSS оболочки из `<style jsx>` в пакет `@trudskill/ui`, где на них начинают действовать сторожа токенов.

**Tech Stack:** Next.js 15 App Router, TypeScript (`exactOptionalPropertyTypes: true`), Vitest без React Testing Library (тесты — на чистых функциях и на структуре исходников), CSS-слои в `packages/ui/src/styles/*`.

**Требования ТЗ:** `IA-002`, `IA-011`, `IA-013`, `IA-014`, `IA-015`, `IA-020`, `UI-008`, `UI-009`, `UI-020`, `UI-021`, `UI-022`, `TXT-001`.

---

## Что разведка изменила по сравнению с текстом ТЗ

Четыре факта, проверенных по коду 2026-08-11. Все четыре идут строкой в журнал расхождений (Task 8).

| №   | ТЗ говорит                                                                                               | Код на самом деле                                                                                                                                                                                                                   | Следствие для плана                                                                                                |
| --- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| 1   | `navigation-shell.e2e.test.ts` ожидает «в сайдбаре 10 раскрывающихся блоков», его надо переписать (§4.8) | Файл — **13 строк**, проверяет только `typeof mod.AppShell === 'function'`. Никакого ожидания про блоки нет                                                                                                                         | Переписывать нечего. **Хуже: у оболочки вообще нет сторожа.** Task 2 ставит настоящий                              |
| 2   | После переезда CSS хардкод `rgba(15,23,42,0.45)` сделает `token-discipline.test.ts` красным (`UI-020`)   | Сторож проверяет **только радиусы**. Цвета не проверяет вообще, и точно такой же `rgba(15,23,42,0.45)` уже лежит в `modal.ts` внутри пакета                                                                                         | Переезд без правки сторожа **узаконил бы** хардкод. Task 5 вводит токен `--ui-overlay` и расширяет сторож на цвета |
| 3   | Блок «≤7 пунктов» — работа Фазы 1                                                                        | `helpers.test.ts:87` уже проверяет `main.length <= 7` и проходит                                                                                                                                                                    | Сторож есть, но он не проверяет, что в `main` попали **именно пункты роли**. Task 1 добавляет проверку состава     |
| 4   | `primaryNav` есть у всех 5 ролей                                                                         | Ролей в `role-blueprints.ts` пять, **`manager` среди них нет**, хотя ТЗ §4.4 задаёт ему меню                                                                                                                                        | Task 1 добавляет blueprint `manager`                                                                               |
| 5   | `IA-014`: «`primaryNav` берётся у первой по порядку `getSessionRoleBlueprints`» — описано как данность   | Функция фильтрует массив и сохраняет **порядок объявления в файле**, а не порядок ролей сессии. Сегодня `tenant_admin` объявлен четвёртым: администратор, которому выдали ещё и роль преподавателя, **получает меню преподавателя** | Task 1 упорядочивает массив от полной роли к узкой и закрепляет порядок тестом                                     |

**Замечание к находке №5.** Пока меню было общим на 70 пунктов, порядок ролей почти ничего не решал — человек всё равно видел всё. После сокращения до семи он начинает решать, какие семь. Дефект существовал и раньше, но именно эта фаза делает его заметным.

**Проверено дополнительно:** все 24 адреса из `primaryNav` ТЗ §4.4 присутствуют в `navigationModel`. Это важно: `getNavigationView` берёт пункт через `byHref.get(href)` и **молча пропускает** отсутствующий — меню стало бы короче семи без единой ошибки. Task 1 закрывает это тестом навсегда.

---

## Отклонение от буквы решения владельца №3

ТЗ, развилка №3: «CSS оболочки переезжает **в `packages/ui/src/styles/layout.ts`**».

Файл существует, занят (67 строк: сетки дашборда, плитки, центрирование страниц входа) и подключён в `uiGlobalStyles`. Долить туда 288 строк оболочки — получить файл на 355 строк с двумя разными ответственностями.

**Делаем:** новый слой `packages/ui/src/styles/shell.ts`, подключённый в тот же `uiStyleLayers`. Результат для владельца **тот же самый** — CSS уезжает в пакет и попадает под сторожа; отличается только имя файла. Решение №3 по существу («в пакет, под сторожа») соблюдено, по букве («именно в layout.ts») — нет. Если владелец настаивает на букве, Task 4 меняется на одну строку: пишем в `layout.ts`.

---

## File Structure

| Файл                                                            | Ответственность                                       | Действие                                                     |
| --------------------------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------------------ |
| `apps/frontend/src/features/navigation/role-blueprints.ts`      | Данные роли: имя, задачи, короткое меню               | Изменить: новые `primaryNav` + `topJobs`, добавить `manager` |
| `apps/frontend/src/features/navigation/role-blueprints.test.ts` | Сторож состава меню ролей                             | **Создать**                                                  |
| `apps/frontend/src/features/navigation/nav-groups.ts`           | Разбиение маршрутов по 10 блокам ИА                   | Изменить: вынести чистую `groupItemsByNavGroup`              |
| `apps/frontend/src/features/navigation/nav-groups.test.ts`      | Сторож разбиения                                      | Изменить: тесты на новую функцию                             |
| `apps/frontend/src/widgets/shell/nav-hint.tsx`                  | Однократная подсказка о новом меню (`IA-020`)         | **Создать**                                                  |
| `apps/frontend/src/widgets/shell/nav-hint-storage.ts`           | Чтение/запись факта показа подсказки (чистые функции) | **Создать**                                                  |
| `apps/frontend/src/widgets/shell/nav-hint-storage.test.ts`      | Тесты хранения подсказки                              | **Создать**                                                  |
| `apps/frontend/src/widgets/shell/app-shell.tsx`                 | Каркас: меню, шапка, крошки                           | Изменить: плоское меню + «Ещё», удалить `<style jsx>`        |
| `apps/frontend/src/widgets/shell/command-palette.tsx`           | Палитра `Ctrl+K`                                      | Изменить: удалить `<style jsx>`                              |
| `apps/frontend/src/e2e/navigation-shell.e2e.test.ts`            | Сторож оболочки                                       | Изменить: настоящие инварианты вместо смоук-импорта          |
| `packages/ui/src/styles/shell.ts`                               | CSS каркаса приложения                                | **Создать**                                                  |
| `packages/ui/src/styles/index.ts`                               | Реестр CSS-слоёв                                      | Изменить: +1 слой                                            |
| `packages/ui/src/tokens/index.ts`                               | Токены тем                                            | Изменить: `--ui-overlay` в обе темы                          |
| `packages/ui/src/tokens/base-vars.test.ts`                      | Сторож токенов                                        | Изменить: проверка нового токена                             |
| `packages/ui/src/styles/modal.ts`                               | CSS модалок                                           | Изменить: `rgba(...)` → `var(--ui-overlay)`                  |
| `packages/ui/src/styles/token-discipline.test.ts`               | Сторож дисциплины токенов                             | Изменить: расширить на цвета                                 |
| `docs/FRONTEND_UX_GOVERNANCE.md`                                | Оперативный регламент UX                              | Изменить: §1 глоссарий, §2 одно первичное действие           |
| `docs/TZ_UI_REDESIGN_STATUS.md`                                 | Трекер ТЗ                                             | Изменить: статусы + журнал + сессия                          |
| `LMS_AGENT_HANDOFF.md`, `README.md`                             | Передача сессии                                       | Изменить                                                     |

**Итого 19 файлов** — в бюджете фазы (≤30).

---

### Task 1: Короткие меню ролей — данные

**Files:**

- Modify: `apps/frontend/src/features/navigation/role-blueprints.ts`
- Create: `apps/frontend/src/features/navigation/role-blueprints.test.ts`

- [ ] **Step 1: Написать падающий тест**

Создать `apps/frontend/src/features/navigation/role-blueprints.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { navigationModel } from './model';
import { getSessionRoleBlueprints, roleBlueprints } from './role-blueprints';

import type { UserSession } from '../../entities/session/model';

const sessionWithRoles = (roles: string[]): UserSession => ({
  user: {
    id: 'u1',
    tenantId: 'tenant_demo',
    login: 'user',
    email: null,
    status: 'active',
    displayName: 'User'
  },
  tokens: { accessToken: 'a', sessionId: 's1', expiresIn: 300 },
  roles,
  permissions: []
});

describe('короткие меню ролей (IA-013)', () => {
  it('меню администратора — ровно 7 пунктов из ТЗ §4.4', () => {
    const admin = roleBlueprints.find((item) => item.role === 'tenant_admin');
    expect(admin?.primaryNav).toEqual([
      '/workspace',
      '/learners',
      '/groups',
      '/assessment',
      '/documents',
      '/reports',
      '/settings'
    ]);
  });

  it('ни у одной роли меню не длиннее 7 пунктов (бюджет плотности §13.2)', () => {
    const tooLong = roleBlueprints
      .filter((item) => item.primaryNav.length > 7)
      .map((item) => `${item.role}: ${item.primaryNav.length}`);
    expect(tooLong).toEqual([]);
  });

  /*
   * Ключевой тест фазы. getNavigationView берёт пункт через byHref.get(href) и
   * МОЛЧА пропускает адрес, которого нет в navigationModel: меню окажется короче
   * семи, ошибки не будет, заметить можно только глазами. Опечатка в адресе здесь
   * стоит пропавшего раздела.
   */
  it('каждый адрес из primaryNav существует в navigationModel', () => {
    const known = new Set(navigationModel.map((item) => item.href));
    const missing = roleBlueprints.flatMap((blueprint) =>
      blueprint.primaryNav
        .filter((href) => !known.has(href))
        .map((href) => `${blueprint.role} → ${href}`)
    );
    expect(missing).toEqual([]);
  });

  it('у администратора в меню есть раздел с адресом /admin/* или ведущий к нему', () => {
    // Старый список ['/', '/users', '/reports', '/audit', '/settings'] не вёл ни в
    // один админский маршрут — из меню было не попасть в ежедневную работу.
    const admin = roleBlueprints.find((item) => item.role === 'tenant_admin');
    expect(admin?.primaryNav).toContain('/groups');
    expect(admin?.primaryNav).toContain('/learners');
  });

  it('роль manager имеет своё меню (ТЗ §4.4)', () => {
    const manager = roleBlueprints.find((item) => item.role === 'manager');
    expect(manager?.primaryNav).toEqual([
      '/groups',
      '/learners',
      '/counterparties',
      '/documents',
      '/reports'
    ]);
  });

  it('getSessionRoleBlueprints находит manager по роли сессии', () => {
    const found = getSessionRoleBlueprints(sessionWithRoles(['manager'])).map((item) => item.role);
    expect(found).toEqual(['manager']);
  });

  it('задачи администратора сформулированы результатом, а не обязанностью (IA-002)', () => {
    const admin = roleBlueprints.find((item) => item.role === 'tenant_admin');
    expect(admin?.topJobs[0]).toBe('Увидеть, что горит сегодня');
    expect(admin?.topJobs).toContain('Зачислить слушателя в группу');
  });

  /*
   * IA-014. getSessionRoleBlueprints возвращает роли в порядке ОБЪЯВЛЕНИЯ массива,
   * а не в порядке ролей сессии, и getNavigationView берёт меню у первой. Значит
   * порядок записей в файле молча решает, какое меню увидит человек с двумя
   * ролями: при алфавитном порядке администратор, числящийся ещё и менеджером,
   * получил бы меню менеджера и не нашёл бы своих разделов.
   *
   * Порядок задан от самой полной роли к самой узкой — тем же принципом, что и
   * таблица домашних маршрутов в role-home.ts («порядок = приоритет», §5.241).
   */
  it('IA-014: у мультироли меню берётся от самой полной роли', () => {
    const admin = roleBlueprints.find((item) => item.role === 'tenant_admin');
    const blueprints = getSessionRoleBlueprints(sessionWithRoles(['manager', 'tenant_admin']));
    expect(blueprints[0]?.role).toBe('tenant_admin');
    expect(blueprints[0]?.primaryNav).toEqual(admin?.primaryNav);
  });

  it('IA-014: порядок ролей задан от полной к узкой и закреплён', () => {
    expect(roleBlueprints.map((item) => item.role)).toEqual([
      'platform_admin',
      'tenant_admin',
      'manager',
      'methodist',
      'teacher',
      'learner'
    ]);
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

```bash
pnpm --filter @trudskill/frontend exec vitest run src/features/navigation/role-blueprints.test.ts --no-file-parallelism
```

Ожидаемо: FAIL. Первая ошибка — `roleBlueprints` не экспортируется (`SyntaxError` / `undefined`), затем несовпадение состава меню.

- [ ] **Step 3: Переписать данные ролей**

В `apps/frontend/src/features/navigation/role-blueprints.ts` заменить объявление массива и все пять записей:

```ts
/*
 * Экспортируется ради сторожевого теста: состав короткого меню — продуктовое
 * решение ТЗ §4.4, а не деталь реализации, и разъехаться с ТЗ он не должен.
 *
 * ПОРЯДОК ЗАПИСЕЙ ЗНАЧИМ. getSessionRoleBlueprints фильтрует этот массив и
 * сохраняет порядок объявления, а getNavigationView берёт меню у ПЕРВОЙ роли.
 * Поэтому список идёт от самой полной роли к самой узкой: администратор, которому
 * дополнительно выдали роль менеджера, должен увидеть меню администратора, а не
 * менеджера. Тот же принцип, что в таблице домашних маршрутов role-home.ts.
 */
export const roleBlueprints: RoleBlueprint[] = [
  {
    role: 'platform_admin',
    displayName: 'Администратор платформы',
    topJobs: [
      'Проверить здоровье арендаторов',
      'Завести или приостановить центр',
      'Разобрать очередь и сбои',
      'Проверить лицензии и оплату',
      'Поднять журнал действий'
    ],
    primaryNav: [
      '/workspace',
      '/platform/tenants',
      '/admin/licenses',
      '/audit',
      '/admin/operations',
      '/settings'
    ]
  },
  {
    role: 'tenant_admin',
    displayName: 'Администратор',
    // ТЗ §3.1: формулировки — результат для человека, а не обязанность роли.
    topJobs: [
      'Увидеть, что горит сегодня',
      'Зачислить слушателя в группу',
      'Закрыть группу и выдать документы',
      'Выгрузить реестр в надзор',
      'Найти слушателя и ответить по нему'
    ],
    primaryNav: [
      '/workspace',
      '/learners',
      '/groups',
      '/assessment',
      '/documents',
      '/reports',
      '/settings'
    ]
  },
  {
    role: 'manager',
    displayName: 'Менеджер',
    topJobs: [
      'Зачислить слушателя в группу',
      'Собрать группу под заказчика',
      'Выдать документы группе',
      'Ответить заказчику по прогрессу',
      'Выгрузить отчёт'
    ],
    primaryNav: ['/groups', '/learners', '/counterparties', '/documents', '/reports']
  },
  {
    role: 'methodist',
    displayName: 'Методист',
    topJobs: [
      'Собрать программу курса',
      'Обновить материалы и версии',
      'Собрать тест и задания',
      'Передать курс на публикацию',
      'Найти пробелы в программах'
    ],
    primaryNav: ['/methodist', '/courses', '/materials', '/assessment', '/groups', '/reports']
  },
  {
    role: 'teacher',
    displayName: 'Преподаватель',
    topJobs: [
      'Проверить работы в очереди',
      'Посмотреть прогресс группы',
      'Ответить слушателям',
      'Спланировать занятия',
      'Открыть материалы курса'
    ],
    primaryNav: [
      '/groups',
      '/teacher/review',
      '/teacher/grading-center',
      '/learning/calendar',
      '/courses',
      '/notifications'
    ]
  },
  {
    role: 'learner',
    displayName: 'Слушатель',
    topJobs: [
      'Продолжить обучение с последнего места',
      'Сдать тест или задание',
      'Проверить сроки',
      'Забрать документы об обучении',
      'Написать преподавателю'
    ],
    primaryNav: [
      '/learner',
      '/learner/courses',
      '/learner/tests',
      '/learner/documents',
      '/notifications',
      '/chat'
    ]
  }
];
```

Псевдоним роли добавить в существующий `roleAliases`:

```ts
const roleAliases: Record<string, string> = {
  admin: 'tenant_admin',
  administrator: 'tenant_admin',
  teacher: 'teacher',
  tutor: 'teacher',
  methodologist: 'methodist',
  sales_manager: 'manager'
};
```

- [ ] **Step 4: Запустить тест — должен пройти**

```bash
pnpm --filter @trudskill/frontend exec vitest run src/features/navigation/role-blueprints.test.ts --no-file-parallelism
```

Ожидаемо: PASS, 7 тестов.

- [ ] **Step 5: Проверить, что не сломаны соседние тесты**

```bash
pnpm --filter @trudskill/frontend exec vitest run src/features/navigation src/e2e --no-file-parallelism
```

Ожидаемо: PASS. Разведка показала, что `lms-role-flows.e2e.test.ts` и `role-journeys.test.ts` на blueprint'ы **не завязаны** (ТЗ §4.8 ошибочно относит первый к затронутым) — но прогон обязателен: смена `displayName` могла зацепить неучтённое место. Если что-то упало — поправить ожидания теста, **не возвращая старые формулировки и не меняя порядок ролей**.

`ia-architecture.e2e.test.ts` обязан остаться зелёным **без правок**: разбиение маршрутов эта фаза не трогает. Его покраснение означает, что задели `NAV_GROUPS` — это ошибка, а не повод править сторожа.

- [ ] **Step 6: Коммит**

```bash
git add apps/frontend/src/features/navigation/role-blueprints.ts apps/frontend/src/features/navigation/role-blueprints.test.ts
git commit -m "feat(frontend): короткие меню ролей по ТЗ §4.4 (IA-013, IA-002)"
```

---

### Task 2: Оболочка переходит на getNavigationView

**Files:**

- Modify: `apps/frontend/src/features/navigation/nav-groups.ts`
- Modify: `apps/frontend/src/features/navigation/nav-groups.test.ts`
- Modify: `apps/frontend/src/widgets/shell/app-shell.tsx:15,31,139-176`
- Modify: `apps/frontend/src/e2e/navigation-shell.e2e.test.ts`

- [ ] **Step 1: Написать падающий тест на чистую функцию группировки**

Добавить в конец `apps/frontend/src/features/navigation/nav-groups.test.ts`:

```ts
describe('группировка произвольного набора пунктов (IA-015)', () => {
  it('раскладывает переданные пункты по блокам ИА, пустые блоки отбрасывает', () => {
    const items = [
      { href: '/courses', label: 'Курсы' },
      { href: '/audit', label: 'Журнал действий' }
    ];
    const groups = groupItemsByNavGroup(items);
    expect(groups.map((group) => group.id)).toEqual(['courses', 'reports']);
    expect(groups[0]?.items.map((item) => item.href)).toEqual(['/courses']);
  });

  it('пункт вне 10 блоков не теряется — попадает в блок «Ещё»', () => {
    // Иначе раздел исчезнет из интерфейса молча: ровно так уже пропадали /forms и
    // /module-empty (§5.249). Потеря маршрута — критерий провала фазы (ТЗ §1.3).
    const groups = groupItemsByNavGroup([{ href: '/unknown-route', label: 'Неизвестный' }]);
    const allHrefs = groups.flatMap((group) => group.items.map((item) => item.href));
    expect(allHrefs).toContain('/unknown-route');
  });

  it('порядок пунктов внутри блока — как в NAV_GROUPS, а не как во входном массиве', () => {
    const groups = groupItemsByNavGroup([
      { href: '/materials', label: 'Материалы' },
      { href: '/courses', label: 'Курсы' }
    ]);
    expect(groups[0]?.items.map((item) => item.href)).toEqual(['/courses', '/materials']);
  });
});
```

Дописать импорт в шапку файла:

```ts
import {
  NAV_GROUPS,
  getGroupedNavigation,
  groupItemsByNavGroup,
  resolveGroupForPath
} from './nav-groups';
```

- [ ] **Step 2: Запустить тест — должен упасть**

```bash
pnpm --filter @trudskill/frontend exec vitest run src/features/navigation/nav-groups.test.ts --no-file-parallelism
```

Ожидаемо: FAIL — `groupItemsByNavGroup is not a function`.

- [ ] **Step 3: Вынести чистую функцию в `nav-groups.ts`**

Заменить существующий `getGroupedNavigation` на пару «чистая функция + обёртка»:

```ts
/** Служебный блок для пунктов, не попавших ни в один из 10 блоков ИА. */
const FALLBACK_GROUP: NavGroup = {
  id: 'other',
  label: 'Ещё',
  icon: LayoutDashboardIcon,
  hrefs: []
};

/**
 * Раскладывает ПЕРЕДАННЫЕ пункты по блокам ИА. Пустые блоки отбрасываются,
 * порядок внутри блока — по group.hrefs.
 *
 * Пункт, не найденный ни в одном блоке, уходит в служебный блок «Ещё», а не
 * исчезает: потеря раздела из интерфейса — критерий провала фазы (ТЗ §1.3),
 * а сторож ia-architecture следит за маршрутами, но не за пунктами меню.
 */
export const groupItemsByNavGroup = (items: NavigationItem[]): NavGroupView[] => {
  const byHref = new Map(items.map((item) => [item.href, item]));
  const placed = new Set<string>();

  const groups = NAV_GROUPS.map((group) => {
    const groupItems = group.hrefs
      .map((href) => byHref.get(href))
      .filter((item): item is NavigationItem => Boolean(item));
    groupItems.forEach((item) => placed.add(item.href));
    return { id: group.id, label: group.label, icon: group.icon, items: groupItems };
  }).filter((group) => group.items.length > 0);

  const orphans = items.filter((item) => !placed.has(item.href));
  if (!orphans.length) return groups;

  return [
    ...groups,
    {
      id: FALLBACK_GROUP.id,
      label: FALLBACK_GROUP.label,
      icon: FALLBACK_GROUP.icon,
      items: orphans
    }
  ];
};

/** Все видимые по правам пункты, разложенные по блокам (второй уровень «Ещё», крошки). */
export const getGroupedNavigation = (session: UserSession | null): NavGroupView[] =>
  groupItemsByNavGroup(getVisibleNavigation(session));
```

- [ ] **Step 4: Запустить тест — должен пройти**

```bash
pnpm --filter @trudskill/frontend exec vitest run src/features/navigation/nav-groups.test.ts --no-file-parallelism
```

Ожидаемо: PASS.

- [ ] **Step 5: Написать падающий сторож оболочки**

Заменить содержимое `apps/frontend/src/e2e/navigation-shell.e2e.test.ts` целиком:

```ts
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { getNavigationView, getVisibleNavigation } from '../features/navigation/helpers';
import { navigationModel } from '../features/navigation/model';

import type { UserSession } from '../entities/session/model';

// Пути — от файла, а не от process.cwd(): cwd различается между запуском из корня
// и из apps/frontend (грабля из CLAUDE.md).
const shellSource = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../widgets/shell/app-shell.tsx'),
  'utf8'
);

// Администратор центра: в живой базе роли выданы ВСЕ права без исключения
// (0010_iam_role_permissions_and_seed.sql:98-108) — поэтому видит все пункты.
const adminSession: UserSession = {
  user: {
    id: 'u_admin',
    tenantId: 'tenant_demo',
    login: 'admin',
    email: null,
    status: 'active',
    displayName: 'Админ'
  },
  tokens: { accessToken: 'a', sessionId: 's1', expiresIn: 300 },
  roles: ['tenant_admin'],
  permissions: Array.from(
    new Set(navigationModel.flatMap((item) => item.requiredPermissions ?? []))
  )
};

describe('оболочка приложения', () => {
  it('AppShell импортируется без ошибок', async () => {
    const mod = await import('../widgets/shell/app-shell');
    expect(typeof mod.AppShell).toBe('function');
  });

  it('CommandPalette импортируется без ошибок', async () => {
    const mod = await import('../widgets/shell/command-palette');
    expect(typeof mod.CommandPalette).toBe('function');
  });

  it('GOAL-1: администратору видно не больше 7 пунктов сразу', () => {
    expect(getNavigationView(adminSession).main.length).toBeLessThanOrEqual(7);
  });

  it('GOAL-1: до фазы админ видел все пункты — теперь их заметно больше семи', () => {
    // Сторож самой метрики: если пунктов вдруг стало ≤7, «сокращение» перестало
    // что-либо доказывать, и тест выше проходит по построению.
    expect(getVisibleNavigation(adminSession).length).toBeGreaterThan(20);
  });

  it('GOAL-5: ни один видимый пункт не потерян — main + more покрывают всё', () => {
    const view = getNavigationView(adminSession);
    const shown = [...view.main, ...view.more].map((item) => item.href).sort();
    const visible = getVisibleNavigation(adminSession)
      .map((item) => item.href)
      .sort();
    expect(shown).toEqual(visible);
  });

  it('пункт не может оказаться одновременно в главном меню и в «Ещё»', () => {
    const view = getNavigationView(adminSession);
    const mainSet = new Set(view.main.map((item) => item.href));
    const both = view.more.filter((item) => mainSet.has(item.href));
    expect(both).toEqual([]);
  });

  it('IA-011: оболочка собирает меню через getNavigationView', () => {
    expect(shellSource).toContain('getNavigationView');
  });

  it('UI-022: в оболочке нет styled-jsx — CSS живёт в пакете под сторожами', () => {
    expect(shellSource).not.toContain('<style jsx>');
  });
});
```

- [ ] **Step 6: Запустить сторож — должен упасть на двух последних проверках**

```bash
pnpm --filter @trudskill/frontend exec vitest run src/e2e/navigation-shell.e2e.test.ts --no-file-parallelism
```

Ожидаемо: FAIL — `IA-011` (в исходнике нет `getNavigationView`) и `UI-022` (есть `<style jsx>`). Остальные проходят: `getNavigationView` уже написана.

- [ ] **Step 7: Перевести `app-shell.tsx` на плоское меню + «Ещё»**

Заменить импорт на строке 15:

```tsx
import { getGroupedNavigation, groupItemsByNavGroup } from '../../features/navigation/nav-groups';
import { getNavigationView } from '../../features/navigation/helpers';
```

Заменить строку 31 и блок состояния раскрытий (строки 39-45, 88-97):

```tsx
const navView = getNavigationView(session);
const moreGroups = useMemo(() => groupItemsByNavGroup(navView.more), [navView.more]);
const [moreOpen, setMoreOpen] = useState(false);
const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
```

Заменить `<nav>` целиком (строки 139-176):

```tsx
<nav className="app-shell__nav" aria-label="Основные разделы">
  {navView.main.map((item) => {
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
  {moreGroups.length ? (
    <div className="app-shell__more">
      <button
        type="button"
        className="app-shell__more-toggle"
        aria-expanded={moreOpen}
        aria-controls="app-shell-more"
        onClick={() => setMoreOpen((open) => !open)}
      >
        <span className="app-shell__more-title">Ещё</span>
        <span className={`app-shell__chevron ${moreOpen ? 'is-open' : ''}`}>
          <Icon icon={ChevronDownIcon} size={16} />
        </span>
      </button>
      <div id="app-shell-more" className="app-shell__more-panel" hidden={!moreOpen}>
        {moreGroups.map((group) => {
          const open = openGroups[group.id] ?? false;
          const regionId = `nav-group-${group.id}`;
          return (
            <div className="app-shell__group" key={group.id}>
              <button
                type="button"
                className="app-shell__group-header"
                aria-expanded={open}
                aria-controls={regionId}
                onClick={() =>
                  setOpenGroups((prev) => ({ ...prev, [group.id]: !(prev[group.id] ?? false) }))
                }
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
      </div>
    </div>
  ) : null}
</nav>
```

Добавить авто-раскрытие «Ещё», когда активная страница лежит внутри него — иначе человек на странице из «Ещё» не видит, где он находится:

```tsx
// Активный раздел внутри «Ещё» — раскрываем и панель, и его блок.
const activeMoreGroupId =
  moreGroups.find((group) => group.items.some((item) => isItemActive(item.href)))?.id ?? null;

useEffect(() => {
  if (!activeMoreGroupId) return;
  setMoreOpen(true);
  setOpenGroups((prev) =>
    prev[activeMoreGroupId] ? prev : { ...prev, [activeMoreGroupId]: true }
  );
}, [activeMoreGroupId]);
```

`getGroupedNavigation` из импорта **не удалять**: она нужна крошкам через `resolveGroupForPath` и остаётся публичной (`IA-012`). Если линтер ругается на неиспользуемый импорт в этом файле — убрать его именно здесь, сама функция остаётся в `nav-groups.ts`.

- [ ] **Step 8: Запустить сторож — теперь падает только UI-022**

```bash
pnpm --filter @trudskill/frontend exec vitest run src/e2e/navigation-shell.e2e.test.ts --no-file-parallelism
```

Ожидаемо: FAIL только на `UI-022` (styled-jsx уедет в Task 4). Проверка `IA-011` — PASS.

- [ ] **Step 9: Коммит**

```bash
git add apps/frontend/src/features/navigation/nav-groups.ts apps/frontend/src/features/navigation/nav-groups.test.ts apps/frontend/src/widgets/shell/app-shell.tsx apps/frontend/src/e2e/navigation-shell.e2e.test.ts
git commit -m "feat(frontend): плоское меню роли и второй уровень «Ещё» (IA-011, IA-015)"
```

---

### Task 3: Однократная подсказка о новом меню (IA-020)

**Files:**

- Create: `apps/frontend/src/widgets/shell/nav-hint-storage.ts`
- Create: `apps/frontend/src/widgets/shell/nav-hint-storage.test.ts`
- Create: `apps/frontend/src/widgets/shell/nav-hint.tsx`
- Modify: `apps/frontend/src/widgets/shell/app-shell.tsx`

- [ ] **Step 1: Написать падающий тест хранения**

Создать `apps/frontend/src/widgets/shell/nav-hint-storage.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest';

import { NAV_HINT_STORAGE_KEY, isNavHintDismissed, readNavHintState } from './nav-hint-storage';

describe('память подсказки о новом меню (IA-020)', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('по умолчанию подсказка показывается', () => {
    expect(isNavHintDismissed(readNavHintState(window.localStorage))).toBe(false);
  });

  it('после закрытия подсказка больше не показывается', () => {
    window.localStorage.setItem(NAV_HINT_STORAGE_KEY, 'dismissed');
    expect(isNavHintDismissed(readNavHintState(window.localStorage))).toBe(true);
  });

  it('мусор в ключе трактуется как «не закрыто», а не как ошибка', () => {
    // Плохой разбор не должен ронять каркас приложения: цена ошибки здесь —
    // лишний показ подсказки, а не белый экран.
    window.localStorage.setItem(NAV_HINT_STORAGE_KEY, '{{{');
    expect(isNavHintDismissed(readNavHintState(window.localStorage))).toBe(false);
  });

  it('недоступное хранилище (приватный режим) не роняет чтение', () => {
    const broken = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('SecurityError');
      }
    } as unknown as Storage;
    expect(() => readNavHintState(broken)).not.toThrow();
    expect(isNavHintDismissed(readNavHintState(broken))).toBe(false);
  });

  it('ключ уже назван новым брендом — Фазе 8 его переименовывать не придётся', () => {
    expect(NAV_HINT_STORAGE_KEY).toBe('trudskill.ui.nav-hint.v1');
    expect(NAV_HINT_STORAGE_KEY).not.toContain('cdoprof');
  });
});
```

- [ ] **Step 2: Запустить — падает**

```bash
pnpm --filter @trudskill/frontend exec vitest run src/widgets/shell/nav-hint-storage.test.ts --no-file-parallelism
```

Ожидаемо: FAIL — модуля нет.

- [ ] **Step 3: Реализовать хранение**

Создать `apps/frontend/src/widgets/shell/nav-hint-storage.ts`:

```ts
/*
 * IA-020: однократная подсказка «меню стало короче».
 *
 * Ключ намеренно назван НОВЫМ брендом сразу. Ребрендинг (BR-020..BR-023, Фаза 8)
 * переименовывает старые ключи с периодом двойного чтения — заводить сегодня ещё
 * один ключ со словом cdoprof значило бы добавить себе работы в той фазе.
 *
 * Хранилище передаётся аргументом, а не берётся из window: так функция чистая и
 * проверяема, включая случай недоступного localStorage в приватном режиме.
 */
export const NAV_HINT_STORAGE_KEY = 'trudskill.ui.nav-hint.v1';

export type NavHintState = 'dismissed' | 'pending';

export const readNavHintState = (storage: Storage): NavHintState => {
  try {
    return storage.getItem(NAV_HINT_STORAGE_KEY) === 'dismissed' ? 'dismissed' : 'pending';
  } catch {
    return 'pending';
  }
};

export const writeNavHintDismissed = (storage: Storage): void => {
  try {
    storage.setItem(NAV_HINT_STORAGE_KEY, 'dismissed');
  } catch {
    // Приватный режим: подсказка покажется ещё раз. Это не повод падать.
  }
};

export const isNavHintDismissed = (state: NavHintState): boolean => state === 'dismissed';
```

- [ ] **Step 4: Запустить — проходит**

```bash
pnpm --filter @trudskill/frontend exec vitest run src/widgets/shell/nav-hint-storage.test.ts --no-file-parallelism
```

Ожидаемо: PASS, 5 тестов.

- [ ] **Step 5: Написать компонент подсказки**

Создать `apps/frontend/src/widgets/shell/nav-hint.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';

import { isNavHintDismissed, readNavHintState, writeNavHintDismissed } from './nav-hint-storage';

/**
 * IA-020: однократное объяснение нового меню. Читается только на клиенте после
 * монтирования — на сервере localStorage нет, и рендер разъехался бы с гидрацией.
 */
export const NavHint = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(!isNavHintDismissed(readNavHintState(window.localStorage)));
  }, []);

  if (!visible) return null;

  return (
    <div className="app-shell__hint" role="status">
      <p className="app-shell__hint-text">
        Меню стало короче. Всё остальное — в разделе «Ещё» и по Ctrl+K.
      </p>
      <button
        type="button"
        className="ui-button"
        onClick={() => {
          writeNavHintDismissed(window.localStorage);
          setVisible(false);
        }}
      >
        Понятно
      </button>
    </div>
  );
};
```

- [ ] **Step 6: Подключить в оболочку**

В `app-shell.tsx` добавить импорт и вставить компонент сразу после `</nav>` внутри `<aside>`:

```tsx
import { NavHint } from './nav-hint';
```

```tsx
        </nav>
        <NavHint />
      </aside>
```

- [ ] **Step 7: Проверить сборку и линт**

```bash
pnpm --filter @trudskill/frontend exec tsc -p tsconfig.json --noEmit
npx eslint apps/frontend/src/widgets/shell/nav-hint.tsx apps/frontend/src/widgets/shell/nav-hint-storage.ts --max-warnings=0
```

Ожидаемо: обе команды без ошибок.

- [ ] **Step 8: Коммит**

```bash
git add apps/frontend/src/widgets/shell/nav-hint.tsx apps/frontend/src/widgets/shell/nav-hint-storage.ts apps/frontend/src/widgets/shell/nav-hint-storage.test.ts apps/frontend/src/widgets/shell/app-shell.tsx
git commit -m "feat(frontend): однократная подсказка о новом меню (IA-020)"
```

---

### Task 4: CSS оболочки переезжает в пакет

**Files:**

- Create: `packages/ui/src/styles/shell.ts`
- Modify: `packages/ui/src/styles/index.ts`
- Modify: `apps/frontend/src/widgets/shell/app-shell.tsx` (удалить `<style jsx>`, строки 236-523)

- [ ] **Step 1: Создать слой CSS каркаса**

Создать `packages/ui/src/styles/shell.ts`. Содержимое — CSS из `app-shell.tsx` с четырьмя изменениями, отмеченными комментариями:

```ts
export const shellStyles = `
.app-shell { min-height: 100vh; display: grid; grid-template-columns: 260px 1fr; position: relative; }
.app-shell__menu-toggle { display: none; }
.app-shell__skip-link {
  position: absolute;
  top: -40px;
  left: 12px;
  z-index: 12000;
  background: var(--ui-surface);
  color: var(--ui-text);
  padding: 8px 10px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  text-decoration: none;
}
.app-shell__skip-link:focus { top: 12px; }
.app-shell__backdrop { display: none; }
.app-shell__sidebar {
  border-right: 1px solid var(--ui-border);
  padding: 16px;
  background: var(--ui-nav-sidebar-bg, var(--ui-surface));
}
.app-shell__brand { margin: 0 0 14px; color: var(--ui-nav-text, var(--ui-text)); }
.app-shell__role {
  margin: 0 0 16px;
  font-size: var(--ui-font-size-sm);
  color: var(--ui-nav-text-muted, var(--ui-text-muted));
}
.app-shell__link {
  text-decoration: none;
  color: var(--ui-nav-text, var(--ui-text));
  padding: 10px 12px;
  border-radius: var(--ui-radius-md);
  font-weight: 600;
}
.app-shell__link:hover {
  background: var(--ui-nav-hover-bg, var(--ui-surface-muted));
  color: var(--ui-nav-text, var(--ui-text));
}
.app-shell__link.is-active {
  color: var(--ui-nav-active-text, var(--ui-brand-700));
  background: var(--ui-nav-active-bg);
}
.app-shell__nav { display: flex; flex-direction: column; gap: 2px; }
.app-shell__more { margin-top: 8px; border-top: 1px solid var(--ui-border); padding-top: 8px; }
.app-shell__more-toggle,
.app-shell__group-header {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  border: none;
  background: transparent;
  border-radius: var(--ui-radius-md);
  color: var(--ui-nav-text, var(--ui-text));
  cursor: pointer;
}
/* UI-009: было четыре усилителя разом (uppercase + letter-spacing + вес 700 +
   размер 13px) на неглавном элементе. Остаётся вес 600 и обычный регистр —
   заголовок блока отделяется расстоянием, а не криком. */
.app-shell__more-toggle { font-weight: 600; font-size: var(--ui-font-size-md); }
.app-shell__group-header { font-weight: 600; font-size: var(--ui-font-size-sm); }
.app-shell__more-toggle:hover,
.app-shell__group-header:hover { background: var(--ui-nav-hover-bg, var(--ui-surface-muted)); }
.app-shell__more-title,
.app-shell__group-title { flex: 1 1 auto; text-align: left; }
.app-shell__more-panel[hidden] { display: none; }
.app-shell__chevron {
  display: inline-flex;
  color: var(--ui-nav-text-muted, var(--ui-text-muted));
  transition: transform 0.18s ease;
}
.app-shell__chevron.is-open { transform: rotate(180deg); }
.app-shell__group { display: flex; flex-direction: column; }
.app-shell__group-items { gap: 2px; padding: 2px 0 6px 12px; }
.app-shell__group-items[hidden] { display: none; }
.app-shell__hint {
  margin-top: 16px;
  padding: 12px;
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface-accent);
  color: var(--ui-text);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.app-shell__hint-text { margin: 0; font-size: var(--ui-font-size-sm); line-height: 1.4; }
@media (prefers-reduced-motion: reduce) {
  .app-shell__chevron { transition: none; }
}
.app-shell__content { display: grid; grid-template-rows: 64px auto; min-width: 0; }
.app-shell__topbar {
  border-bottom: 1px solid var(--ui-border);
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 16px;
  gap: 12px;
  background: var(--ui-surface);
  flex-wrap: wrap;
}
.app-shell__breadcrumbs {
  color: var(--ui-text-muted);
  font-size: 14px;
  min-width: 0;
  flex: 1 1 200px;
}
.app-shell__crumb { white-space: nowrap; }
.app-shell__crumb-link { color: var(--ui-text-muted); text-decoration: none; }
.app-shell__crumb-link:hover { color: var(--ui-brand-700); text-decoration: underline; }
.app-shell__crumb-current { color: var(--ui-text); font-weight: 500; }
.app-shell__crumb-block { color: var(--ui-text-muted); font-weight: 500; }
.app-shell__userbar { flex: 0 1 auto; justify-content: flex-end; gap: 12px; }
.app-shell__search {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 10px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-surface);
  color: var(--ui-text-muted);
  cursor: pointer;
  font-size: var(--ui-font-size-sm);
}
.app-shell__search:hover { color: var(--ui-text); }
.app-shell__kbd {
  font-size: 11px;
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-sm);
  padding: 1px 5px;
  color: var(--ui-text-muted);
}
.app-shell__meta {
  font-size: var(--ui-font-size-sm);
  color: var(--ui-text-muted);
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.app-shell__notif-link {
  text-decoration: none;
  color: inherit;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
@media (max-width: 1024px) {
  .app-shell { grid-template-columns: 1fr; }
  .app-shell__menu-toggle {
    display: inline-flex;
    position: fixed;
    top: 12px;
    left: 12px;
    z-index: 10001;
    align-items: center;
    height: 40px;
    padding: 0 14px;
    border-radius: var(--ui-radius-md);
    border: 1px solid var(--ui-border);
    background: var(--ui-surface);
    color: var(--ui-text);
    font-weight: 600;
    cursor: pointer;
    box-shadow: var(--ui-shadow);
  }
  .app-shell__backdrop {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 9998;
    border: none;
    padding: 0;
    margin: 0;
    background: var(--ui-overlay);
    cursor: pointer;
  }
  .app-shell__sidebar {
    position: fixed;
    top: 0;
    left: 0;
    bottom: 0;
    width: min(300px, 88vw);
    z-index: 10000;
    transform: translateX(-102%);
    transition: transform 0.2s ease;
    box-shadow: var(--ui-shadow-strong);
    overflow-y: auto;
    border-right: 1px solid var(--ui-border);
  }
  .app-shell__sidebar.is-drawer-open { transform: translateX(0); }
  .app-shell__sidebar .ui-stack {
    flex-direction: column;
    flex-wrap: unset;
    overflow-x: visible;
    padding-bottom: 0;
  }
  .app-shell__content { padding-top: 56px; }
  .app-shell__link { white-space: normal; }
}
/* ФТ-H4: телефон ≤480px. Правила :global(...) больше не нужны — CSS стал
   глобальным слоем пакета, и scoped-классов styled-jsx, мимо которых он
   промахивался, больше нет (это был «давний дефект каркаса» из комментария). */
@media (max-width: 480px) {
  .app-shell__content { grid-template-rows: auto 1fr; }
  .app-shell__topbar { padding: 8px 12px; }
  .app-shell__crumb { white-space: normal; }
  .app-shell__menu-toggle { height: 44px; }
  .app-shell__more-toggle,
  .app-shell__group-header { min-height: 44px; display: flex; align-items: center; }
  .app-shell__link,
  .app-shell__notif-link { min-height: 44px; display: flex; align-items: center; }
  .app-shell__search { height: 44px; }
}
`;
```

- [ ] **Step 2: Подключить слой**

В `packages/ui/src/styles/index.ts` добавить импорт и запись в реестр:

```ts
import { shellStyles } from './shell.js';
```

```ts
export const uiStyleLayers = {
  foundation: foundationStyles,
  forms: formStyles,
  tables: tableStyles,
  layout: layoutStyles,
  shell: shellStyles,
  chat: chatStyles,
  modal: modalStyles,
  courseViewer: courseViewerStyles
} as const;
```

- [ ] **Step 3: Удалить `<style jsx>` из `app-shell.tsx`**

Удалить весь блок со строки `<style jsx>{\`` до закрывающего `\`}</style>` включительно (строки 236-523 исходной версии). Больше в файле ничего не меняется.

- [ ] **Step 4: Запустить сторожа пакета — token-discipline станет красным**

```bash
pnpm --filter @trudskill/ui exec vitest run src/styles --no-file-parallelism
```

Ожидаемо: FAIL в `token-discipline.test.ts` — новый слой ещё содержит `var(--ui-overlay)`, которого нет в токенах, но красным будет именно проверка радиусов, если где-то остался `10px`/`14px`. **Это сторож работает, а не мешает.** Убрать оставшиеся числовые радиусы в `shell.ts`, затем перейти к Task 5 (токен `--ui-overlay`).

- [ ] **Step 5: Запустить сторож оболочки — UI-022 теперь зелёный**

```bash
pnpm --filter @trudskill/frontend exec vitest run src/e2e/navigation-shell.e2e.test.ts --no-file-parallelism
```

Ожидаемо: PASS, 8 тестов.

- [ ] **Step 6: Коммит**

```bash
git add packages/ui/src/styles/shell.ts packages/ui/src/styles/index.ts apps/frontend/src/widgets/shell/app-shell.tsx
git commit -m "refactor(ui): CSS каркаса переезжает из styled-jsx в пакет (UI-020, UI-009)"
```

---

### Task 5: Токен подложки и сторож цвета

**Files:**

- Modify: `packages/ui/src/tokens/index.ts`
- Modify: `packages/ui/src/tokens/base-vars.test.ts`
- Modify: `packages/ui/src/styles/modal.ts:3,8`
- Modify: `packages/ui/src/styles/token-discipline.test.ts`

- [ ] **Step 1: Написать падающие тесты**

Добавить в `packages/ui/src/tokens/base-vars.test.ts`:

```ts
describe('токен подложки всплывающих слоёв', () => {
  it('--ui-overlay объявлен в обеих темах', () => {
    expect(lightThemeVars['--ui-overlay']).toBeTruthy();
    expect(darkThemeVars['--ui-overlay']).toBeTruthy();
  });

  it('в тёмной теме подложка плотнее — светлый фон под ней ярче', () => {
    expect(darkThemeVars['--ui-overlay']).not.toBe(lightThemeVars['--ui-overlay']);
  });
});
```

Добавить в `packages/ui/src/styles/token-discipline.test.ts`:

```ts
// Сторож цвета. До Фазы 1 проверялись только радиусы, и rgba(15,23,42,0.45) жил
// в modal.ts прямо внутри пакета никем не замеченный. Переезд CSS каркаса сюда же
// узаконил бы хардкод во второй раз — поэтому проверка добавлена вместе с ним.
describe('дисциплина цвета в CSS-слоях', () => {
  it('нет литеральных rgb/rgba-цветов', () => {
    const found = uiGlobalStyles.match(/rgba?\(\s*\d+\s*,/g) ?? [];
    expect(found).toEqual([]);
  });

  it('нет литеральных hex-цветов', () => {
    const found = uiGlobalStyles.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    expect(found).toEqual([]);
  });

  it('подложка берётся из токена', () => {
    expect(uiGlobalStyles).toContain('var(--ui-overlay)');
  });
});
```

- [ ] **Step 2: Запустить — падает**

```bash
pnpm --filter @trudskill/ui exec vitest run src/tokens/base-vars.test.ts src/styles/token-discipline.test.ts --no-file-parallelism
```

Ожидаемо: FAIL — токена нет, `rgba(15, 23, 42, 0.45)` найден в `modal.ts` (два вхождения).

- [ ] **Step 3: Ввести токен**

В `packages/ui/src/tokens/index.ts` добавить в `lightThemeVars`:

```ts
  /* Подложка всплывающих слоёв: модалка, палитра, drawer меню. */
  '--ui-overlay': 'rgba(15, 23, 42, 0.45)',
```

и в `darkThemeVars`:

```ts
  /* В тёмной теме под подложкой лежит тёмный фон — прозрачность 0.45 почти не
     отделяла бы слой от страницы, поэтому плотнее. */
  '--ui-overlay': 'rgba(2, 6, 23, 0.66)',
```

- [ ] **Step 4: Перевести модалку на токен**

В `packages/ui/src/styles/modal.ts` заменить оба вхождения:

```ts
.ui-modal-backdrop { position: absolute; inset: 0; background: var(--ui-overlay); }
```

```ts
.ui-modal { position: fixed; inset: 0; z-index: 10050; display: grid; place-items: center; padding: 16px; background: var(--ui-overlay); overflow-y: auto; }
```

- [ ] **Step 5: Запустить всю пачку сторожей пакета**

```bash
pnpm --filter @trudskill/ui exec vitest run --no-file-parallelism
```

Ожидаемо: PASS. Если сторож цвета нашёл ещё вхождения в других слоях — заменить их тем же токеном; если найденный цвет не является подложкой, завести отдельный токен, **не ослабляя тест**.

- [ ] **Step 6: Коммит**

```bash
git add packages/ui/src/tokens/index.ts packages/ui/src/tokens/base-vars.test.ts packages/ui/src/styles/modal.ts packages/ui/src/styles/token-discipline.test.ts
git commit -m "feat(ui): токен --ui-overlay и сторож цвета в CSS-слоях (UI-020)"
```

---

### Task 6: CSS палитры команд переезжает в пакет (UI-021)

**Files:**

- Modify: `packages/ui/src/styles/shell.ts`
- Modify: `apps/frontend/src/widgets/shell/command-palette.tsx:114-...`
- Modify: `apps/frontend/src/e2e/navigation-shell.e2e.test.ts`

- [ ] **Step 1: Расширить сторож на палитру**

В `navigation-shell.e2e.test.ts` добавить чтение второго файла и проверку:

```ts
const paletteSource = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../widgets/shell/command-palette.tsx'),
  'utf8'
);
```

```ts
it('UI-022: в палитре команд нет styled-jsx', () => {
  expect(paletteSource).not.toContain('<style jsx>');
});
```

- [ ] **Step 2: Запустить — падает**

```bash
pnpm --filter @trudskill/frontend exec vitest run src/e2e/navigation-shell.e2e.test.ts --no-file-parallelism
```

Ожидаемо: FAIL на новой проверке.

- [ ] **Step 3: Перенести CSS палитры**

Дописать в конец `packages/ui/src/styles/shell.ts` (внутрь той же шаблонной строки, перед закрывающим бэктиком):

```css
.cmdk {
  position: fixed;
  inset: 0;
  z-index: 13000;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding-top: 12vh;
}
.cmdk__scrim {
  position: absolute;
  inset: 0;
  border: none;
  padding: 0;
  margin: 0;
  background: var(--ui-overlay);
  cursor: pointer;
}
.cmdk__dialog {
  position: relative;
  width: min(560px, 92vw);
  background: var(--ui-surface);
  border: 1px solid var(--ui-border);
  border-radius: var(--ui-radius-lg);
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
/* 16px — не из шкалы намеренно: Safari на iOS увеличивает страницу при фокусе в
   поле с размером меньше 16px, и палитра «прыгает» под пальцем. */
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
  border-radius: var(--ui-radius-md);
  cursor: pointer;
  color: var(--ui-text);
}
.cmdk__option.is-active {
  background: var(--ui-nav-active-bg, var(--ui-surface-muted));
  color: var(--ui-nav-active-text, var(--ui-brand-700));
}
.cmdk__option-group {
  font-size: var(--ui-font-size-xs);
  color: var(--ui-text-muted);
  white-space: nowrap;
}
.cmdk__empty {
  padding: 16px 12px;
  color: var(--ui-text-muted);
  text-align: center;
}
```

Затем удалить из `command-palette.tsx` блок со строки `<style jsx>{\`` (строка 114) до `\`}</style>` (строка 189) включительно.

- [ ] **Step 4: Запустить сторожа обоих пакетов**

```bash
pnpm --filter @trudskill/ui exec vitest run src/styles --no-file-parallelism
pnpm --filter @trudskill/frontend exec vitest run src/e2e/navigation-shell.e2e.test.ts --no-file-parallelism
```

Ожидаемо: обе команды PASS. Если сторож радиусов красный — в перенесённом CSS остался числовой радиус, заменить на переменную шкалы.

- [ ] **Step 5: Коммит**

```bash
git add packages/ui/src/styles/shell.ts apps/frontend/src/widgets/shell/command-palette.tsx apps/frontend/src/e2e/navigation-shell.e2e.test.ts
git commit -m "refactor(ui): CSS палитры команд переезжает в пакет (UI-021, UI-022)"
```

---

### Task 7: Регламент UX приводится в соответствие с ТЗ

**Files:**

- Modify: `docs/FRONTEND_UX_GOVERNANCE.md`

- [ ] **Step 1: Обновить глоссарий §1 (TXT-001)**

Заменить блок «Базовый глоссарий»:

```markdown
### Базовый глоссарий

- `workspace` -> `Оперативная панель`
- `next actions` -> `Разобрать` (не «Следующие действия»: первое — что делает человек, второе — что думает система)
- `inbox tasks` -> `Задачи` (слово «inbox» — англицизм, запрещённый правилом языка выше)
- `blockers` -> `Блокеры`
- `severity` -> `Критичность`
- `integration settings` -> `Настройки интеграций`
- `sync logs` -> `Журнал синхронизации`
```

- [ ] **Step 2: Обновить правило §2 (UI-008)**

Заменить строку про `actions`:

```markdown
- `actions`: **ровно одно первичное действие** в header (ТЗ редизайна `UI-007`). Второе действие уходит в меню «…» рядом с первым либо в тело секции, к которой относится. Два первичных действия — это отсутствие ответа на вопрос «что делать дальше».
```

- [ ] **Step 3: Убрать блок известных расхождений**

Из шапки документа удалить врезку «Известные расхождения, ожидающие Фазы 1» целиком — расхождений больше нет. Строку о подчинении ТЗ **оставить**.

- [ ] **Step 4: Проверить, что ТЗ и регламент больше не спорят**

```bash
grep -n "не более 2 первичных\|Задачи inbox\|Следующие действия" docs/FRONTEND_UX_GOVERNANCE.md
```

Ожидаемо: пустой вывод.

- [ ] **Step 5: Коммит**

```bash
git add docs/FRONTEND_UX_GOVERNANCE.md
git commit -m "docs(ux): регламент приведён к ТЗ редизайна — одно первичное действие, глоссарий (UI-008, TXT-001)"
```

---

### Task 8: Приёмка фазы и передача

**Files:**

- Modify: `docs/TZ_UI_REDESIGN_STATUS.md`
- Modify: `LMS_AGENT_HANDOFF.md`
- Modify: `README.md`

- [ ] **Step 1: Полный прогон качества**

```bash
pnpm ci:check
```

Ожидаемо: exit 0. Прогон обязателен целиком — фаза не закрывается по зелёным точечным тестам.

- [ ] **Step 2: Живая проверка на 360px**

Запустить приложение и открыть оболочку на ширине 360px. Проверить три числа:

```js
document.documentElement.scrollWidth; // ожидается 360
document.querySelectorAll('.app-shell__link').length; // пунктов главного меню ≤ 7
getComputedStyle(document.querySelector('.app-shell__more-toggle')).minHeight; // '44px'
```

Ожидаемо: горизонтальной прокрутки нет, тач-зоны 44px, «Ещё» открывается и закрывается.

- [ ] **Step 3: Прогон Tab**

Пройти Tab от пропуска к содержимому до первой ссылки внутри «Ещё». Ожидаемо: фокус виден на каждом шаге, порядок совпадает с визуальным, из свёрнутой панели «Ещё» фокус не попадает на скрытые ссылки (за это отвечает `hidden`).

- [ ] **Step 4: Обновить статусы требований**

В `docs/TZ_UI_REDESIGN_STATUS.md`:

- Фаза 1 → `✅ завершена`, в столбец «План» — ссылка на этот файл.
- `IA-002`, `IA-011`, `IA-013`, `IA-015`, `IA-020`, `UI-009`, `UI-020`, `UI-021`, `UI-022`, `UI-008`, `TXT-001` → `✅`.
- `GOAL-1` → `✅` с указанием фактического числа пунктов у администратора.
- Записи журнала №1, №4, №8, №10 → `✅ исправлено` со ссылкой на handoff (строки **не удалять**).

- [ ] **Step 5: Дописать в журнал расхождений четыре находки разведки**

Добавить строками (нумерация продолжает существующую):

```markdown
| 12 | 2026-08-11 | слепая зона | ТЗ §4.8 считает, что `navigation-shell.e2e.test.ts` стережёт «10 раскрывающихся блоков»; на деле это 13 строк смоук-импорта, у оболочки не было ни одного инварианта | `src/e2e/navigation-shell.e2e.test.ts` | ✅ исправлено | Фаза 1, Task 2 — сторож переписан на 8 инвариантов |
| 13 | 2026-08-11 | слепая зона | `token-discipline.test.ts` проверял только радиусы; `rgba(15,23,42,0.45)` жил в `modal.ts` внутри пакета, и переезд CSS каркаса узаконил бы хардкод во второй раз | `packages/ui/src/styles/token-discipline.test.ts` | ✅ исправлено | Фаза 1, Task 5 — токен `--ui-overlay` + сторож цвета |
| 14 | 2026-08-11 | дрейф | Роль `manager` есть в системе и в ТЗ §4.4, но blueprint'а в `role-blueprints.ts` не было — короткого меню у неё не существовало | `features/navigation/role-blueprints.ts` | ✅ исправлено | Фаза 1, Task 1 |
| 15 | 2026-08-11 | слепая зона | `getNavigationView` молча пропускает адрес, которого нет в `navigationModel`: опечатка в `primaryNav` укорачивает меню без единой ошибки | `features/navigation/helpers.ts:41` | ✅ исправлено | Фаза 1, Task 1 — тест на существование каждого адреса |
| 16 | 2026-08-11 | дефект UX | Меню мультироли берётся у первой записи `roleBlueprints` в порядке ОБЪЯВЛЕНИЯ файла: `tenant_admin` стоял четвёртым, и администратор с дополнительной ролью преподавателя получал меню преподавателя. До сокращения меню дефект был незаметен — человек всё равно видел все 70 пунктов | `features/navigation/role-blueprints.ts` | ✅ исправлено | Фаза 1, Task 1 — порядок от полной роли к узкой, закреплён тестом |
```

- [ ] **Step 6: Записать сессию в handoff**

Добавить `### 5.259` в `LMS_AGENT_HANDOFF.md` §5: что сделано, файлы, числа тестов до и после, отклонение по решению №3 (слой `shell.ts` вместо `layout.ts`), результат живой проверки на 360px.

- [ ] **Step 7: Обновить README §2**

Новая запись «текущее» с датой, номером §5.259 и следующим шагом — Фаза 2 «Эталонный реестр и карточка».

- [ ] **Step 8: Коммит**

```bash
git add docs/TZ_UI_REDESIGN_STATUS.md LMS_AGENT_HANDOFF.md README.md docs/superpowers/plans/2026-08-11-tz-ui-faza1-navigaciya-i-obolochka.md
git commit -m "docs(tz): Фаза 1 редизайна закрыта — статусы, журнал расхождений, handoff §5.259"
```

---

## Критерии приёмки фазы

- [ ] `pnpm ci:check` зелёный.
- [ ] Администратору в сайдбаре видно **≤7 пунктов** (проверяется тестом, не глазами).
- [ ] `main + more` покрывают **все** видимые по правам пункты — ни один раздел не потерян.
- [ ] `ia-architecture.e2e.test.ts` зелёный **без изменений** — разбиение маршрутов не трогали.
- [ ] В `apps/frontend` не осталось `<style jsx>` в оболочке и палитре; сторож `UI-022` это держит.
- [ ] Сторож цвета в `packages/ui` зелёный: литеральных `rgb/rgba/hex` в CSS-слоях нет.
- [ ] 360px: `scrollWidth === 360`, тач-зоны ≥44px.
- [ ] Прогон Tab без ловушек, фокус виден.
- [ ] Тёмная тема открыта и просмотрена (подложка `--ui-overlay` плотнее светлой).
- [ ] `FRONTEND_UX_GOVERNANCE.md` не противоречит ТЗ ни одной строкой.

## Как откатить

Одним обратным коммитом на Task 2: возврат строки 31 `app-shell.tsx` к `getGroupedNavigation` восстанавливает старое меню целиком. Переезд CSS (Task 4-6) откатывается независимо и на состав меню не влияет.

## Что фаза сознательно НЕ делает

| Не делаем                                                  | Почему                                                            | Где будет                                  |
| ---------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------ |
| Редиректы дублей `/admin/cockpit`, `/admin/learners`       | Меняют поведение (ТЗ §4.9), нужен отдельный разговор с владельцем | Фазы 3 и 4                                 |
| Сборка настроек `/settings`                                | Крупная работа своей фазы                                         | Фаза 4, `IA-018`                           |
| Замена `confirm()` на `ConfirmDialog`                      | 9 вызовов на 8 экранах — вне рамок оболочки                       | Фаза 4, `CMP-006`                          |
| Переезд `state-wrappers` в пакет                           | 57 файлов, правится волнами вместе с экранами                     | Фаза 2, `CMP-020`                          |
| Правка миграции `0010`, из-за которой у админа все 70 прав | Историческая миграция + вопрос ролевой модели, не представления   | Решение владельца; лечится слоем видимости |
