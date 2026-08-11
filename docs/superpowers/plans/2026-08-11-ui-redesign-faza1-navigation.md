# Фаза 1 ТЗ редизайна · Навигация и оболочка — план реализации

> **Для агентов:** исполнять по `superpowers:executing-plans` (последовательно) — задачи связаны одним файлом `app-shell.tsx`, параллелить нельзя. Шаги — чекбоксы `- [ ]`.

**Цель:** администратор видит в меню ≤7 пунктов вместо 70; всё остальное доступно через «Ещё» и `Ctrl+K`, ни один маршрут не теряется.

**Архитектура:** информационная архитектура разделяется на два независимых слоя (`IA-010`). Слой **разбиения** — 10 блоков ИА в `nav-groups.ts`, покрывают все 102 маршрута, охраняются `ia-architecture.e2e.test.ts` и **не меняются**. Слой **видимости** — `getNavigationView` (уже написана, покрыта тестом, но не подключена) плюс `primaryNav` в `role-blueprints.ts`. Работа сводится к подключению готового механизма, замене устаревших списков `primaryNav` и переносу CSS оболочки из `<style jsx>` в `packages/ui/src/styles/layout.ts`, где его видят сторожа токенов.

**Стек:** Next.js 15 (app router), React 19, TypeScript, vitest (без RTL — логика выносится в чистые функции и тестируется напрямую), пакет `@trudskill/ui` с токенами и `uiGlobalStyles`.

## Глобальные ограничения

- **URL маршрутов не меняются.** Редиректы дублей (`/admin/cockpit`, `/admin/learners`) — Фазы 3 и 4, не эта.
- **Контракты `packages/api-contracts` и RBAC-модель не трогаются.** Права берутся из `iam.role_permissions` живой базы, не из названий ролей.
- **`ia-architecture.e2e.test.ts` остаётся зелёным без единой правки** — это критерий приёмки фазы (ТЗ §12, Фаза 1).
- **`getGroupedNavigation` не удаляется** (`IA-012`): она нужна второму уровню «Ещё» и хлебным крошкам через `resolveGroupForPath`.
- **Сторожей не ослаблять.** `token-discipline.test.ts` покраснеет после переноса CSS — это ожидаемо и чинится заменой хардкода на токены, а не правкой сторожа.
- Фаза = один PR = один обратимый шаг, **≤30 файлов** (ожидается ~16).
- Бюджет меню: **≤7 пунктов** в главном списке у каждой роли (`IA-013`).
- Тексты: обращение на «вы» со строчной, без англицизмов, без восклицательных знаков (`TXT-006`, `TXT-007`).
- Фаза заканчивается зелёным `pnpm ci:check`, обновлённым handoff `§5.254`, README `§2` и статус-трекером `docs/TZ_UI_REDESIGN_STATUS.md`.

## Карта файлов

| Файл                                                            | Ответственность                                | Действие                                                                  |
| --------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------- |
| `apps/frontend/src/features/navigation/role-blueprints.ts`      | Списки `primaryNav` и `topJobs` по ролям       | Изменить: новые списки, добавить роль `manager`                           |
| `apps/frontend/src/features/navigation/role-blueprints.test.ts` | Сторож бюджета ≤7 и существования маршрутов    | Создать                                                                   |
| `apps/frontend/src/features/navigation/nav-groups.ts`           | 10 блоков ИА + сборка второго уровня           | Изменить: добавить `buildMoreSections`                                    |
| `apps/frontend/src/features/navigation/nav-groups.test.ts`      | Тесты блоков                                   | Изменить: тесты `buildMoreSections`                                       |
| `apps/frontend/src/features/navigation/helpers.test.ts`         | Тесты `getNavigationView`                      | Изменить: проверки нового состава меню                                    |
| `apps/frontend/src/widgets/shell/nav-hint.ts`                   | Чистая логика однократной подсказки (`IA-020`) | Создать                                                                   |
| `apps/frontend/src/widgets/shell/nav-hint.test.ts`              | Тесты подсказки                                | Создать                                                                   |
| `apps/frontend/src/widgets/shell/app-shell.tsx`                 | Каркас: сайдбар, шапка, крошки                 | Изменить: плоское меню + «Ещё» + подсказка; удалить `<style jsx>`         |
| `apps/frontend/src/widgets/shell/command-palette.tsx`           | Командная палитра                              | Изменить: удалить `<style jsx>`                                           |
| `packages/ui/src/styles/layout.ts`                              | CSS оболочки и палитры на токенах              | Изменить: принять перенесённый CSS                                        |
| `packages/ui/src/styles/index.ts`                               | Сборка `uiGlobalStyles`                        | Проверить подключение `layout.ts`                                         |
| `apps/frontend/src/e2e/navigation-shell.e2e.test.ts`            | Сторож каркаса                                 | Изменить: настоящий инвариант вместо проверки импорта                     |
| `apps/frontend/src/e2e/lms-role-flows.e2e.test.ts`              | Пути ролей                                     | Изменить: ожидания под новый `primaryNav`                                 |
| `apps/frontend/src/e2e/styled-jsx-ban.e2e.test.ts`              | Сторож `UI-022`: `<style jsx>` запрещён        | Создать                                                                   |
| `docs/FRONTEND_UX_GOVERNANCE.md`                                | Регламент интерфейса                           | Изменить: §1 глоссарий (`TXT-001`), §2 одно первичное действие (`UI-008`) |
| `docs/TZ_UI_REDESIGN_STATUS.md`                                 | Трекер ТЗ редизайна                            | Изменить: статусы, журнал расхождений, журнал сессий                      |
| `README.md`, `LMS_AGENT_HANDOFF.md`                             | Передача следующему агенту                     | Изменить: `§2` и `§5.254`                                                 |

---

### Task 1: Новые `primaryNav` и `topJobs` (`IA-013`, `IA-002`)

**Файлы:**

- Изменить: `apps/frontend/src/features/navigation/role-blueprints.ts`
- Создать: `apps/frontend/src/features/navigation/role-blueprints.test.ts`

**Интерфейсы:**

- Использует: `navigationModel` из `./model` (массив `NavigationItem` с полем `href`), `getSessionRoleBlueprints(session)`.
- Отдаёт: тот же экспорт `RoleBlueprint[]` — состав `primaryNav` меняется, сигнатуры нет. `getNavigationView` читает его без правок.

**Почему так:** текущий `primaryNav` администратора `['/', '/users', '/reports', '/audit', '/settings']` не ведёт ни в один `/admin/*` и не покрывает четыре из семи сценариев (ТЗ §3.1). Роли `manager` в файле нет вовсе — она получит запасной путь «первые 7 из `navSlot !== 'more'`», то есть случайный набор.

- [ ] **Шаг 1: Написать падающий тест**

Создать `apps/frontend/src/features/navigation/role-blueprints.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { navigationModel } from './model';
import { getRoleBlueprints } from './role-blueprints';

describe('role blueprints', () => {
  it('каждая роль укладывается в бюджет меню ≤7 пунктов', () => {
    for (const blueprint of getRoleBlueprints()) {
      expect(blueprint.primaryNav.length).toBeLessThanOrEqual(7);
    }
  });

  it('каждый маршрут primaryNav существует в модели навигации', () => {
    const known = new Set(navigationModel.map((item) => item.href));
    for (const blueprint of getRoleBlueprints()) {
      for (const href of blueprint.primaryNav) {
        expect(known, `${blueprint.role}: ${href}`).toContain(href);
      }
    }
  });

  it('администратор получает семь пунктов из ТЗ §4.4', () => {
    const admin = getRoleBlueprints().find((item) => item.role === 'tenant_admin');
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

  it('менеджер описан отдельной ролью, а не запасным путём', () => {
    const manager = getRoleBlueprints().find((item) => item.role === 'manager');
    expect(manager?.primaryNav).toEqual([
      '/groups',
      '/learners',
      '/counterparties',
      '/documents',
      '/reports'
    ]);
  });
});
```

- [ ] **Шаг 2: Убедиться, что тест падает**

Запустить: `pnpm --filter @trudskill/frontend exec vitest run src/features/navigation/role-blueprints.test.ts`
Ожидание: FAIL — `getRoleBlueprints` не экспортирован.

- [ ] **Шаг 3: Реализовать**

В `role-blueprints.ts` заменить содержимое массива `roleBlueprints` на списки из ТЗ §3.1 и §4.4 и добавить экспорт для теста:

```ts
const roleBlueprints: RoleBlueprint[] = [
  {
    role: 'learner',
    displayName: 'Слушатель',
    topJobs: [
      'Продолжить обучение с последнего места',
      'Сдать задание или пройти тест',
      'Посмотреть свои документы',
      'Проверить сроки и уведомления'
    ],
    primaryNav: [
      '/learner',
      '/learner/courses',
      '/learner/tests',
      '/learner/documents',
      '/notifications',
      '/chat'
    ]
  },
  {
    role: 'methodist',
    displayName: 'Методист',
    topJobs: [
      'Собрать программу и структуру курса',
      'Обновить материалы и версии',
      'Собрать тест и назначить его группе',
      'Передать курс на публикацию'
    ],
    primaryNav: ['/methodist', '/courses', '/materials', '/assessment', '/groups', '/reports']
  },
  {
    role: 'teacher',
    displayName: 'Преподаватель',
    topJobs: [
      'Проверить задания и выставить оценку',
      'Посмотреть прогресс группы',
      'Ответить слушателю',
      'Спланировать занятия по срокам'
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
    role: 'manager',
    displayName: 'Менеджер',
    topJobs: [
      'Зачислить слушателя в группу',
      'Найти слушателя и ответить на вопрос',
      'Вести заказчика и его сотрудников',
      'Проверить выданные документы'
    ],
    primaryNav: ['/groups', '/learners', '/counterparties', '/documents', '/reports']
  },
  {
    role: 'tenant_admin',
    displayName: 'Администратор',
    // ТЗ §3.1: формулировки — проверяемые сценарии JOB-A1…JOB-A7, а не обобщения.
    topJobs: [
      'Увидеть, что горит, сразу после входа',
      'Зачислить слушателя в группу',
      'Закрыть группу и выдать документы',
      'Выгрузить реестр в надзор',
      'Найти слушателя и увидеть всё по нему',
      'Поправить курс и тест, не теряя связей',
      'Найти нужную настройку центра'
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
    role: 'platform_admin',
    displayName: 'Администратор платформы',
    topJobs: [
      'Следить за состоянием учебных центров',
      'Завести центр и назначить тариф',
      'Разобрать сбой в очередях и выгрузках',
      'Проверить журнал действий'
    ],
    primaryNav: [
      '/workspace',
      '/platform/tenants',
      '/admin/licenses',
      '/audit',
      '/admin/operations',
      '/settings'
    ]
  }
];

/** Для сторожевых тестов: полный список без привязки к сессии. */
export const getRoleBlueprints = (): RoleBlueprint[] => roleBlueprints;
```

Также добавить в `roleAliases` строку `sales_manager: 'manager'` **только если** такой псевдоним встречается в живых ролях; проверить командой из шага 4.

- [ ] **Шаг 4: Проверить фактические роли в живой базе (не гадать)**

Запустить:

```bash
docker exec test-postgres psql -U testuser -d trudskill -c "SELECT DISTINCT r.code FROM iam.roles r ORDER BY 1;"
```

Ожидание: список кодов ролей. Если кода `manager` там нет — оставить роль в файле (она есть в `role-home.ts:52`), но записать расхождение в журнал `docs/TZ_UI_REDESIGN_STATUS.md`.

- [ ] **Шаг 5: Прогнать тест**

Запустить: `pnpm --filter @trudskill/frontend exec vitest run src/features/navigation/role-blueprints.test.ts`
Ожидание: PASS, 4 теста.

- [ ] **Шаг 6: Коммит**

```bash
git add apps/frontend/src/features/navigation/role-blueprints.ts apps/frontend/src/features/navigation/role-blueprints.test.ts
git commit -m "feat(frontend): новые главные меню ролей по ТЗ редизайна (IA-013, IA-002)"
```

---

### Task 2: Второй уровень «Ещё» (`IA-015`)

**Файлы:**

- Изменить: `apps/frontend/src/features/navigation/nav-groups.ts`
- Изменить: `apps/frontend/src/features/navigation/nav-groups.test.ts`

**Интерфейсы:**

- Использует: `NAV_GROUPS: NavGroup[]` (10 блоков), `NavigationItem` из `./model`.
- Отдаёт: `buildMoreSections(moreItems: NavigationItem[]): NavGroupView[]` — раскладывает пункты второго уровня по блокам ИА, сохраняя порядок `hrefs` внутри блока; пустые блоки не возвращаются. Использует Task 3 в `app-shell.tsx`.

**Почему так:** «Ещё» обязано быть сгруппировано по тем же 10 блокам (ТЗ §4.5), иначе второй уровень превращается в свалку из 60+ ссылок. Раскладка — чистая функция, чтобы её можно было проверить без рендера (в проекте нет RTL).

- [ ] **Шаг 1: Написать падающий тест**

Дописать в `apps/frontend/src/features/navigation/nav-groups.test.ts`:

```ts
import { buildMoreSections } from './nav-groups';

describe('второй уровень «Ещё»', () => {
  it('раскладывает пункты по блокам ИА и сохраняет порядок блока', () => {
    const sections = buildMoreSections([
      { href: '/audit', label: 'Журнал действий' },
      { href: '/courses', label: 'Курсы' },
      { href: '/materials', label: 'Материалы' }
    ]);
    const ids = sections.map((section) => section.id);
    expect(ids).toContain('courses');
    const courses = sections.find((section) => section.id === 'courses');
    expect(courses?.items.map((item) => item.href)).toEqual(['/courses', '/materials']);
  });

  it('не возвращает пустые блоки', () => {
    const sections = buildMoreSections([{ href: '/audit', label: 'Журнал действий' }]);
    expect(sections.every((section) => section.items.length > 0)).toBe(true);
  });

  it('пункт вне десяти блоков не теряется', () => {
    const sections = buildMoreSections([{ href: '/unknown-route', label: 'Неизвестный' }]);
    const all = sections.flatMap((section) => section.items.map((item) => item.href));
    expect(all).toContain('/unknown-route');
  });
});
```

- [ ] **Шаг 2: Убедиться, что тест падает**

Запустить: `pnpm --filter @trudskill/frontend exec vitest run src/features/navigation/nav-groups.test.ts`
Ожидание: FAIL — `buildMoreSections` не экспортирован.

- [ ] **Шаг 3: Реализовать**

Дописать в `nav-groups.ts`:

```ts
/**
 * Раскладка пунктов второго уровня по блокам ИА (IA-015).
 * Порядок внутри блока — как в NAV_GROUPS.hrefs, чтобы «Ещё» читалось одинаково
 * у всех ролей. Пункт, не попавший ни в один блок, уходит в «Прочее» —
 * молча терять ссылку нельзя, это regression к находке «12 страниц недостижимы».
 */
export const buildMoreSections = (moreItems: NavigationItem[]): NavGroupView[] => {
  const byHref = new Map(moreItems.map((item) => [item.href, item]));
  const used = new Set<string>();

  const sections = NAV_GROUPS.map((group) => {
    const items = group.hrefs
      .map((href) => byHref.get(href))
      .filter((item): item is NavigationItem => Boolean(item));
    items.forEach((item) => used.add(item.href));
    return { id: group.id, label: group.label, icon: group.icon, items };
  }).filter((section) => section.items.length > 0);

  const orphans = moreItems.filter((item) => !used.has(item.href));
  if (orphans.length) {
    sections.push({
      id: 'other',
      label: 'Прочее',
      icon: NAV_GROUPS[NAV_GROUPS.length - 1].icon,
      items: orphans
    });
  }
  return sections;
};
```

- [ ] **Шаг 4: Прогнать тест**

Запустить: `pnpm --filter @trudskill/frontend exec vitest run src/features/navigation/nav-groups.test.ts`
Ожидание: PASS.

- [ ] **Шаг 5: Коммит**

```bash
git add apps/frontend/src/features/navigation/nav-groups.ts apps/frontend/src/features/navigation/nav-groups.test.ts
git commit -m "feat(frontend): раскладка второго уровня «Ещё» по блокам ИА (IA-015)"
```

---

### Task 3: Каркас переходит на короткое меню (`IA-011`)

**Файлы:**

- Изменить: `apps/frontend/src/widgets/shell/app-shell.tsx:15,31,139-178`
- Изменить: `apps/frontend/src/features/navigation/helpers.test.ts`

**Интерфейсы:**

- Использует: `getNavigationView(session): { main: NavigationItem[]; more: NavigationItem[] }` из `../../features/navigation/helpers`, `buildMoreSections` из Task 2.
- Отдаёт: разметку сайдбара — плоский список `main` + кнопка «Ещё», раскрывающая панель с секциями. `getGroupedNavigation` остаётся импортированной **только** если используется крошками; иначе импорт удаляется, а функция — нет (`IA-012`).

- [ ] **Шаг 1: Написать падающий тест состава меню**

Дописать в `apps/frontend/src/features/navigation/helpers.test.ts`:

```ts
describe('состав меню после Фазы 1 редизайна', () => {
  const fullAdmin: UserSession = {
    ...adminSession,
    permissions: navigationModel.flatMap((item) => item.requiredPermissions ?? [])
  };

  it('главное меню администратора не длиннее семи пунктов', () => {
    expect(getNavigationView(fullAdmin).main.length).toBeLessThanOrEqual(7);
  });

  it('главное меню начинается с оперативной панели, а не с реестра пользователей', () => {
    expect(getNavigationView(fullAdmin).main[0]?.href).toBe('/workspace');
  });

  it('ни один доступный пункт не теряется между main и more', () => {
    const view = getNavigationView(fullAdmin);
    const shown = new Set([...view.main, ...view.more].map((item) => item.href));
    for (const item of getVisibleNavigation(fullAdmin)) {
      expect(shown).toContain(item.href);
    }
  });
});
```

- [ ] **Шаг 2: Убедиться, что тест падает**

Запустить: `pnpm --filter @trudskill/frontend exec vitest run src/features/navigation/helpers.test.ts`
Ожидание: FAIL на первом пункте `/workspace` — до Task 1 список начинался с `/`. Если Task 1 уже влит, тест зелёный; тогда падение проявится только в разметке — перейти к шагу 3.

- [ ] **Шаг 3: Переключить каркас**

В `app-shell.tsx` заменить строку 31 и разметку `<nav className="app-shell__nav">`:

```tsx
import { getNavigationView } from '../../features/navigation/helpers';
import { buildMoreSections } from '../../features/navigation/nav-groups';

// ...
const { main: mainItems, more: moreItems } = getNavigationView(session);
const moreSections = useMemo(() => buildMoreSections(moreItems), [moreItems]);
const [moreOpen, setMoreOpen] = useState(false);
```

Разметка сайдбара — плоский список без раскрывающихся блоков:

```tsx
<nav className="app-shell__nav" aria-label="Основные разделы">
  {mainItems.map((item) => (
    <Link
      key={item.href}
      href={item.href}
      className="app-shell__link"
      aria-current={isItemActive(item.href) ? 'page' : undefined}
    >
      {item.label}
    </Link>
  ))}

  {moreSections.length > 0 && (
    <>
      <button
        type="button"
        className="app-shell__more-toggle"
        aria-expanded={moreOpen}
        aria-controls="app-shell-more"
        onClick={() => setMoreOpen((open) => !open)}
      >
        Ещё
        <Icon icon={ChevronDownIcon} size={20} aria-hidden />
      </button>
      {moreOpen && (
        <div id="app-shell-more" className="app-shell__more">
          {moreSections.map((section) => (
            <section key={section.id} className="app-shell__more-section">
              <h2 className="app-shell__group-title">{section.label}</h2>
              {section.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="app-shell__link"
                  aria-current={isItemActive(item.href) ? 'page' : undefined}
                >
                  {item.label}
                </Link>
              ))}
            </section>
          ))}
        </div>
      )}
    </>
  )}
</nav>
```

Удалить ставшие ненужными `openGroups`, `isGroupOpen`, `activeGroupId` и импорт `getGroupedNavigation`, **если** после правки на них нет ссылок (проверить `grep -n "getGroupedNavigation\|openGroups" apps/frontend/src/widgets/shell/app-shell.tsx`).

- [ ] **Шаг 4: Прогнать тесты навигации и сборку**

Запустить:

```bash
pnpm --filter @trudskill/frontend exec vitest run src/features/navigation src/e2e/ia-architecture.e2e.test.ts
```

Ожидание: PASS, включая `ia-architecture.e2e.test.ts` **без правок** — инвариант блоков не тронут.

- [ ] **Шаг 5: Коммит**

```bash
git add apps/frontend/src/widgets/shell/app-shell.tsx apps/frontend/src/features/navigation/helpers.test.ts
git commit -m "feat(frontend): каркас перешёл на короткое меню и «Ещё» (IA-011)"
```

---

### Task 4: Однократная подсказка о новом меню (`IA-020`)

**Файлы:**

- Создать: `apps/frontend/src/widgets/shell/nav-hint.ts`
- Создать: `apps/frontend/src/widgets/shell/nav-hint.test.ts`
- Изменить: `apps/frontend/src/widgets/shell/app-shell.tsx`

**Интерфейсы:**

- Отдаёт: `NAV_HINT_STORAGE_KEY = 'cdoprof.ui.nav-hint.v1'`, `shouldShowNavHint(read: (key: string) => string | null): boolean`, `dismissNavHint(write: (key: string, value: string) => void): void`.
- Хранилище передаётся параметром — так функция тестируется без `localStorage` и не падает в SSR.

**Почему так:** привычные пункты уезжают во второй уровень (`§4.9`), это единственное изменение фазы, которое пользователь может воспринять как пропажу. Подсказка гасит именно этот страх и показывается один раз.

- [ ] **Шаг 1: Написать падающий тест**

Создать `apps/frontend/src/widgets/shell/nav-hint.test.ts`:

```ts
import { describe, expect, it } from 'vitest';

import { NAV_HINT_STORAGE_KEY, dismissNavHint, shouldShowNavHint } from './nav-hint';

describe('однократная подсказка о новом меню', () => {
  it('показывается, пока её не закрыли', () => {
    expect(shouldShowNavHint(() => null)).toBe(true);
  });

  it('не показывается после закрытия', () => {
    expect(shouldShowNavHint((key) => (key === NAV_HINT_STORAGE_KEY ? 'dismissed' : null))).toBe(
      false
    );
  });

  it('закрытие записывает отметку в хранилище', () => {
    const written: Record<string, string> = {};
    dismissNavHint((key, value) => {
      written[key] = value;
    });
    expect(written[NAV_HINT_STORAGE_KEY]).toBe('dismissed');
  });

  it('недоступное хранилище не ломает экран', () => {
    expect(
      shouldShowNavHint(() => {
        throw new Error('storage disabled');
      })
    ).toBe(false);
  });
});
```

- [ ] **Шаг 2: Убедиться, что тест падает**

Запустить: `pnpm --filter @trudskill/frontend exec vitest run src/widgets/shell/nav-hint.test.ts`
Ожидание: FAIL — модуля нет.

- [ ] **Шаг 3: Реализовать**

Создать `apps/frontend/src/widgets/shell/nav-hint.ts`:

```ts
/**
 * IA-020: однократная подсказка после Фазы 1 редизайна.
 * Хранилище передаётся параметром: модуль импортируется и на сервере,
 * где localStorage нет. Ошибка чтения = не показываем (лучше молча,
 * чем белый экран из-за отключённого хранилища).
 */
export const NAV_HINT_STORAGE_KEY = 'cdoprof.ui.nav-hint.v1';

export const shouldShowNavHint = (read: (key: string) => string | null): boolean => {
  try {
    return read(NAV_HINT_STORAGE_KEY) !== 'dismissed';
  } catch {
    return false;
  }
};

export const dismissNavHint = (write: (key: string, value: string) => void): void => {
  try {
    write(NAV_HINT_STORAGE_KEY, 'dismissed');
  } catch {
    /* хранилище недоступно — подсказка просто появится снова */
  }
};
```

- [ ] **Шаг 4: Подключить в каркасе**

В `app-shell.tsx` добавить состояние и разметку над `<nav>`:

```tsx
const [hintVisible, setHintVisible] = useState(false);

useEffect(() => {
  setHintVisible(shouldShowNavHint((key) => localStorage.getItem(key)));
}, []);

// ...
{
  hintVisible && (
    <div className="app-shell__hint" role="status">
      <p>Меню стало короче. Всё остальное — в разделе «Ещё» и по Ctrl+K.</p>
      <button
        type="button"
        onClick={() => {
          dismissNavHint((key, value) => localStorage.setItem(key, value));
          setHintVisible(false);
        }}
      >
        Понятно
      </button>
    </div>
  );
}
```

- [ ] **Шаг 5: Прогнать тест**

Запустить: `pnpm --filter @trudskill/frontend exec vitest run src/widgets/shell/nav-hint.test.ts`
Ожидание: PASS, 4 теста.

- [ ] **Шаг 6: Коммит**

```bash
git add apps/frontend/src/widgets/shell/nav-hint.ts apps/frontend/src/widgets/shell/nav-hint.test.ts apps/frontend/src/widgets/shell/app-shell.tsx
git commit -m "feat(frontend): однократная подсказка о новом меню (IA-020)"
```

---

### Task 5: CSS оболочки переезжает под сторожей (`UI-020`, `UI-021`, `UI-009`, `UI-022`)

**Файлы:**

- Изменить: `packages/ui/src/styles/layout.ts`
- Изменить: `apps/frontend/src/widgets/shell/app-shell.tsx:236-526` (удаление блока `<style jsx>`)
- Изменить: `apps/frontend/src/widgets/shell/command-palette.tsx`
- Создать: `apps/frontend/src/e2e/styled-jsx-ban.e2e.test.ts`

**Интерфейсы:**

- Использует: токены `--ui-*` из `packages/ui/src/tokens`, строку `uiGlobalStyles` из `packages/ui/src/styles/index.ts`.
- Отдаёт: те же классы `.app-shell__*`, но объявленные глобально — обход `:global(...)` (app-shell.tsx:511–513) исчезает вместе со styled-jsx.

**Почему так:** 288 строк CSS каркаса не видит ни `token-discipline.test.ts`, ни `touch-targets.test.ts` — оба проверяют строку `uiGlobalStyles`. Пока CSS живёт в компоненте, дисциплина токенов на каркас не распространяется.

- [ ] **Шаг 1: Написать сторож запрета (падающий)**

Создать `apps/frontend/src/e2e/styled-jsx-ban.e2e.test.ts`:

```ts
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * UI-022: styled-jsx возвращает слой CSS, невидимый сторожам токенов.
 * Исключения добавляются только вместе с обоснованием в описании PR.
 */
const ALLOWED = new Set<string>(['app/learning/calendar/page.tsx']);

const walk = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.next') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else if (entry.name.endsWith('.tsx')) acc.push(full);
  }
  return acc;
};

describe('запрет styled-jsx во фронтенде', () => {
  it('в компонентах нет <style jsx>, кроме явных исключений', () => {
    const root = join(process.cwd(), 'apps/frontend');
    const offenders = walk(root)
      .filter((file) => readFileSync(file, 'utf8').includes('<style jsx'))
      .map((file) => file.slice(root.length + 1))
      .filter((file) => !ALLOWED.has(file));
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Шаг 2: Убедиться, что сторож красный**

Запустить: `pnpm --filter @trudskill/frontend exec vitest run src/e2e/styled-jsx-ban.e2e.test.ts`
Ожидание: FAIL со списком `src/widgets/shell/app-shell.tsx`, `src/widgets/shell/command-palette.tsx`.

- [ ] **Шаг 3: Перенести CSS каркаса**

Скопировать содержимое блока `<style jsx>` из `app-shell.tsx` в `packages/ui/src/styles/layout.ts` как экспортируемую строку и подключить её к `uiGlobalStyles` в `packages/ui/src/styles/index.ts`. При переносе заменить хардкод на токены:

| Было                     | Стало                                |
| ------------------------ | ------------------------------------ |
| `rgba(15, 23, 42, 0.45)` | `var(--ui-overlay)`                  |
| `border-radius: 10px`    | `var(--ui-radius-sm)`                |
| `min(300px, 88vw)`       | `min(var(--ui-sidebar-width), 88vw)` |

Заголовки блоков (`app-shell.tsx:312–315`) переписать по `UI-009`: убрать `text-transform: uppercase` и `letter-spacing`, вес `600`, размер `var(--ui-font-size-sm)`, отделение расстоянием `var(--ui-space-16)`.

Если токена `--ui-overlay` или `--ui-sidebar-width` нет — добавить в `packages/ui/src/tokens/index.ts` и в `base-vars.test.ts` (`UI-015`), иначе `token-discipline.test.ts` останется красным.

- [ ] **Шаг 4: Удалить styled-jsx из обоих компонентов**

Удалить блоки `<style jsx>` из `app-shell.tsx` и `command-palette.tsx` целиком, вместе с обходом `:global(...)`.

- [ ] **Шаг 5: Прогнать сторожей и сборку**

Запустить:

```bash
pnpm --filter @trudskill/ui exec vitest run src/styles
pnpm --filter @trudskill/frontend exec vitest run src/e2e/styled-jsx-ban.e2e.test.ts
pnpm --filter @trudskill/frontend build
```

Ожидание: все три зелёные. `app-shell.tsx` сокращается примерно с 526 строк до ~240 — проверить `wc -l`.

- [ ] **Шаг 6: Коммит**

```bash
git add packages/ui/src apps/frontend/src/widgets/shell apps/frontend/src/e2e/styled-jsx-ban.e2e.test.ts
git commit -m "refactor(ui): CSS оболочки переехал под сторожей токенов (UI-020, UI-021, UI-009, UI-022)"
```

---

### Task 6: Обновить сторожей каркаса (`IA-019`)

**Файлы:**

- Изменить: `apps/frontend/src/e2e/navigation-shell.e2e.test.ts`
- Изменить: `apps/frontend/src/e2e/lms-role-flows.e2e.test.ts`

**Почему так:** `navigation-shell.e2e.test.ts` сейчас проверяет только то, что модуль импортируется (13 строк) — инварианта «в сайдбаре 10 раскрывающихся блоков», заявленного в ТЗ §4.8, там нет. Это слепая зона: каркас можно было сломать, не уронив ни один тест. Расхождение записывается в журнал.

- [ ] **Шаг 1: Заменить проверку импорта настоящим инвариантом**

```ts
import { describe, expect, it } from 'vitest';

import { getNavigationView } from '../features/navigation/helpers';
import { buildMoreSections } from '../features/navigation/nav-groups';
import { navigationModel } from '../features/navigation/model';

import type { UserSession } from '../entities/session/model';

const fullAdmin: UserSession = {
  user: {
    id: 'u_admin',
    tenantId: 'tenant_demo',
    login: 'admin',
    email: null,
    status: 'active',
    displayName: 'Admin'
  },
  tokens: { accessToken: 'a', sessionId: 's1', expiresIn: 1000 },
  roles: ['tenant_admin'],
  permissions: navigationModel.flatMap((item) => item.requiredPermissions ?? [])
};

describe('каркас навигации', () => {
  it('AppShell импортируется без ошибок', async () => {
    const mod = await import('../widgets/shell/app-shell');
    expect(typeof mod.AppShell).toBe('function');
  });

  it('CommandPalette импортируется без ошибок', async () => {
    const mod = await import('../widgets/shell/command-palette');
    expect(typeof mod.CommandPalette).toBe('function');
  });

  it('в главном меню не больше семи пунктов', () => {
    expect(getNavigationView(fullAdmin).main.length).toBeLessThanOrEqual(7);
  });

  it('всё, что не попало в главное меню, доступно во втором уровне', () => {
    const view = getNavigationView(fullAdmin);
    const inMore = new Set(
      buildMoreSections(view.more).flatMap((section) => section.items.map((item) => item.href))
    );
    for (const item of view.more) {
      expect(inMore).toContain(item.href);
    }
  });
});
```

- [ ] **Шаг 2: Обновить ожидания путей ролей**

В `lms-role-flows.e2e.test.ts` добавить проверку, что администратор попадает в ежедневные разделы за один клик:

```ts
it('администратор видит ежедневные разделы в главном меню', () => {
  const main = getNavigationView(adminSession).main.map((item) => item.href);
  expect(main).toContain('/groups');
  expect(main).toContain('/reports');
});
```

Импорт `getNavigationView` добавить к существующему импорту из `../features/navigation/helpers`.

- [ ] **Шаг 3: Прогнать**

Запустить: `pnpm --filter @trudskill/frontend exec vitest run src/e2e`
Ожидание: PASS по всем файлам, включая `ia-architecture.e2e.test.ts` без правок.

- [ ] **Шаг 4: Коммит**

```bash
git add apps/frontend/src/e2e
git commit -m "test(frontend): сторожа каркаса проверяют бюджет меню, а не факт импорта (IA-019)"
```

---

### Task 7: Регламенты и документы фазы (`UI-008`, `TXT-001`)

**Файлы:**

- Изменить: `docs/FRONTEND_UX_GOVERNANCE.md` §1 и §2
- Изменить: `docs/TZ_UI_REDESIGN_STATUS.md`
- Изменить: `README.md` §2, `LMS_AGENT_HANDOFF.md` §5.254

**Почему так:** два регламента не должны противоречить друг другу ни одного дня (`UI-008`): governance §2 разрешает два первичных действия, ТЗ требует одно.

- [ ] **Шаг 1: Обновить governance §2**

Заменить формулировку «не более 2 первичных действий в header» на «**одно** первичное действие в шапке (`UI-007`); второе переносится в меню «…» рядом с первым или в тело секции». Добавить ссылку на ТЗ редизайна как на источник правила.

- [ ] **Шаг 2: Обновить governance §1 (глоссарий)**

Внести по таблице ТЗ §9.1: `next actions` → «Разобрать»; `inbox tasks` → «Задачи» (англицизм убрать); `severity` → «Критичность». Совпадающие термины не трогать.

- [ ] **Шаг 3: Обновить статус-трекер**

В `docs/TZ_UI_REDESIGN_STATUS.md`: Фаза 1 → ✅ с датой и ссылкой на PR; статусы `IA-002`, `IA-011`, `IA-013`, `IA-015`, `IA-020`, `UI-008`, `UI-009` (в части меню), `UI-020`, `UI-021`, `UI-022`, `TXT-001` → ✅; в журнал расхождений добавить строки:

| Что                                                                                                                       | Класс       | Действие            |
| ------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------- |
| `navigation-shell.e2e.test.ts` проверял только импорт модулей, инварианта сайдбара не было (ТЗ §4.8 предполагал обратное) | Слепая зона | Исправлено в Task 6 |
| Роли `manager` не было в `role-blueprints.ts`, хотя её дом задан в `role-home.ts:52` — меню собиралось запасным путём     | Дрейф       | Исправлено в Task 1 |

- [ ] **Шаг 4: Обновить handoff и README**

Добавить `§5.254` в `LMS_AGENT_HANDOFF.md` и переписать «Current Stage» в `README.md` §2: что сделано, чем закрыта Фаза 1, что дальше (Фаза 2 — эталонный реестр `/learners`).

- [ ] **Шаг 5: Полный прогон**

Запустить: `pnpm ci:check`, затем `pnpm --filter @trudskill/frontend exec vitest run` и `pnpm --filter @trudskill/ui exec vitest run`.
Ожидание: `ci:check` exit 0; тесты фронта и `ui` зелёные. **Судить по коду выхода**, а не по последней строке вывода — она клипается.

- [ ] **Шаг 6: Коммит и PR**

```bash
git add docs README.md LMS_AGENT_HANDOFF.md
git commit -m "docs(tz): Фаза 1 редизайна закрыта — регламенты приведены к ТЗ (UI-008, TXT-001)"
git push -u origin worktree-ui-redesign-faza1-navigation
gh pr create --title "feat(frontend): Фаза 1 редизайна — меню из семи пунктов вместо семидесяти" --body "<по шаблону ТЗ §15.2>"
```

---

## Самопроверка плана

**Покрытие ТЗ.** Восемь задач Фазы 1 из §12 разложены так: (1) `IA-011` → Task 3; (2) `IA-013`, `IA-002` → Task 1; (3) `IA-015` → Task 2; (4) `UI-020`, `UI-021` → Task 5; (5) `UI-009` (заголовки меню) → Task 5; (6) `IA-020` → Task 4; (7) обновление тестов → Task 6; (8) `UI-008`, `TXT-001` → Task 7. Дополнительно взят `UI-022` (сторож `<style jsx>`) — он привязан к `UI-020` текстом §5.7 «после переноса добавляется сторож», без него слой вернётся.

**Вне фазы намеренно:** `UI-009` в части hero-блока и токенов (`--ui-hero-*`) — это Фаза 6 по §12; колонка «Маршрут» на `/workspace` (`IA-016.1`) — Фаза 3; редиректы дублей (`IA-017`, `IA-018`) — Фаза 4.

**Совместимость.** URL не меняются, ключи хранения только добавляются (`cdoprof.ui.nav-hint.v1`), контракт API не затрагивается, `ia-architecture.e2e.test.ts` остаётся без правок.
