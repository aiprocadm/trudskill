import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  LEARNER_RIGHTS_SNAPSHOT,
  learnerGrantsByMigration,
  reachableByLearner
} from '../testing/learner-rights.test-util.js';

/**
 * Пятнадцатый сторож семейства «объявлено — кто это исполняет»: **правами слушателя не
 * дотянуться до экрана сотрудника.**
 *
 * Карта навигации фронта (`features/navigation/model.ts`) объявляет у каждого экрана и
 * пункта меню право: по нему `evaluateRouteAccess` пускает на страницу, а
 * `getVisibleNavigation` показывает пункт в меню. Право экрана обязано быть правом
 * ДАННЫХ экрана — тем же, что стоит на ручках бэкенда, которые экран вызывает. Иначе дверь
 * и стена не совпадают. Так жили пятнадцать экранов сотрудников под `tenant.read` — правом,
 * которое есть у КАЖДОЙ роли, включая слушателя (журнал 343):
 *  - «Документы», «Журнал выдачи», «Интеграции», «Экспорт», «Журнал синхронизации»,
 *    «Телефония», «Прокторинг», «Сделки» — слушатель видел их в меню «Ещё», открывал и
 *    упирался в 403 от ручек под `documents.read` / `integrations.read` /
 *    `proctoring.read` / `counterparties.read` — тупик вместо раздела;
 *  - «Оперативная панель» (журнал 342), «Настройка центра», «Учебный центр», «Реквизиты»,
 *    «Комиссия» — ручки стояли под тем же `tenant.read`, и слушатель ВИДЕЛ данные
 *    сотрудников: задачи и блокеры центра, ход настройки, состав комиссии, форму реквизитов.
 *
 * Инвариант: экран (`routeMeta`, не публичный) или пункт меню (`navigationModel`),
 * достижимый правами слушателя, — это экран слушателя (`/learner`, `/learner/**`) или
 * общий экран из `SHARED`, поимённо и с причиной. «Достижимый» — все объявленные права
 * входят в набор слушателя; без прав вовсе — достижим любым вошедшим и тоже считается.
 * Набор прав слушателя — из миграций со сверкой по снимку живой базы
 * (`testing/learner-rights.test-util.ts`), общий с `learner-reaches-registry`: новая выдача
 * слушателю проходит оба сторожа «до чего дотягивается слушатель» сразу.
 *
 * Сторож живёт в бэкенде, хотя читает фронт: набор прав слушателя — знание миграций.
 * Карта читается с диска регулярным выражением, без сборки фронта; незнакомая форма записи
 * роняет отдельный тест, а не молчит.
 *
 * Проверено подсадным нарушителем: экран «Документы» под `tenant.read` роняет тест и
 * называет адрес с правом; мёртвая запись в `SHARED` роняет свой тест.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const NAVIGATION_MODEL = resolve(HERE, '../../../../frontend/src/features/navigation/model.ts');

/**
 * Экраны, которые слушатель видит по праву, — с причиной. Это не «сотрудники», а общее для
 * всех ролей (главная, сообщения, чат) и разделы, чьё право экрана СОВПАДАЕТ с правом
 * ручек, выданным слушателю миграцией 0038 (`courses.read`, `materials.read`,
 * `assessment.*.read`): данные им режет сервис по актору, а уместность самого раздела в
 * меню слушателя — вопрос информационной архитектуры (журнал 345), не прав.
 */
const SHARED: ReadonlyArray<{ path: string; why: string }> = [
  { path: '/', why: 'главная: любой вошедший, дальше ведёт по роли (role-home)' },
  { path: '/notifications', why: 'сообщения: у ручек /notifications права нет — общий канал' },
  { path: '/chat', why: 'чат: у ручек /chat/dialogs права нет — общий канал' },
  {
    path: '/learning/calendar',
    why: 'календарь занятий: слушатель видит свои по enrollments.read, как в кабинете'
  },
  {
    path: '/student/dashboard',
    why: 'прежняя «главная учащегося» — редирект в /learner (журнал 109)'
  },
  { path: '/module-empty', why: 'заглушка «раздел в разработке»: данных нет' },
  { path: '/courses', why: 'courses.read выдан слушателю 0038 — каталог курсов; журнал 345' },
  { path: '/library', why: 'courses.read — библиотека курсов; журнал 345' },
  { path: '/materials', why: 'materials.read выдан слушателю 0038; журнал 345' },
  { path: '/scorm', why: 'materials.read — учебные пакеты; журнал 345' },
  { path: '/methodist', why: 'courses.read — сводка обучения; журнал 345' },
  { path: '/assessment', why: 'assessment.tests.read выдан слушателю 0038; журнал 345' },
  {
    path: '/admin/tests',
    why: 'assessment.tests.read — список тестов, сервис режет по актору; журнал 345'
  },
  { path: '/admin/tests/[id]', why: 'assessment.tests.read — карточка теста; журнал 345' },
  {
    path: '/admin/assignments',
    why: 'assessment.assignments.read — список заданий, сервис режет по актору; журнал 345'
  },
  {
    path: '/admin/assignments/[id]',
    why: 'assessment.assignments.read — карточка задания; журнал 345'
  }
];

type Screen = { kind: 'экран' | 'пункт меню'; path: string; permissions: string[] };

/** Комментарии из TypeScript — до разбора: в них тоже встречаются `pattern:` и `href:`. */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/** Тело массива `export const <name>… = [ … ];` (закрывающая скобка — с начала строки). */
const arrayBody = (source: string, name: string): string => {
  const match = new RegExp(`export const ${name}\\b[^=]*=\\s*\\[([\\s\\S]*?)\\n\\];`).exec(source);
  if (!match) throw new Error(`в карте навигации не найден массив ${name}`);
  return match[1]!;
};

const codesIn = (list: string | undefined): string[] =>
  [...(list ?? '').matchAll(/'([^']+)'/g)].map((m) => m[1]!);

const ROUTE_ENTRY = /\{\s*pattern:\s*'([^']+)'\s*,\s*meta:\s*\{([^}]*)\}\s*\}/g;
const NAV_ENTRY = /\{([^{}]*)\}/g;

const readModel = (): { routes: Screen[]; nav: Screen[]; source: string } => {
  expect(existsSync(NAVIGATION_MODEL), `не найдена карта навигации: ${NAVIGATION_MODEL}`).toBe(
    true
  );
  const source = stripComments(readFileSync(NAVIGATION_MODEL, 'utf8'));

  const routes: Screen[] = [];
  for (const m of arrayBody(source, 'routeMeta').matchAll(ROUTE_ENTRY)) {
    const meta = m[2]!;
    if (/public:\s*true/.test(meta)) continue;
    routes.push({
      kind: 'экран',
      path: m[1]!,
      permissions: codesIn(/requiredPermissions:\s*\[([^\]]*)\]/.exec(meta)?.[1])
    });
  }

  const nav: Screen[] = [];
  for (const m of arrayBody(source, 'navigationModel').matchAll(NAV_ENTRY)) {
    const entry = m[1]!;
    const href = /href:\s*'([^']+)'/.exec(entry)?.[1];
    if (!href) continue;
    nav.push({
      kind: 'пункт меню',
      path: href,
      permissions: codesIn(/requiredPermissions:\s*\[([^\]]*)\]/.exec(entry)?.[1])
    });
  }
  return { routes, nav, source };
};

const isLearnerScreen = (path: string): boolean =>
  path === '/learner' || path.startsWith('/learner/');

const isShared = (path: string): boolean => SHARED.some((s) => s.path === path);

const describeScreen = (s: Screen): string => `${s.kind} ${s.path} [${s.permissions.join(', ')}]`;

const staffScreensReachableByLearner = (): string[] => {
  const { routes, nav } = readModel();
  return [...routes, ...nav]
    .filter((s) => !isLearnerScreen(s.path) && !isShared(s.path))
    .filter((s) => reachableByLearner(s.permissions))
    .map(describeScreen)
    .sort();
};

describe('правами слушателя не дотянуться до экрана сотрудника', () => {
  it('набор прав слушателя читается из миграций и совпадает со снимком живой базы', () => {
    const fromMigrations = new Set(learnerGrantsByMigration().flatMap((g) => g.codes));
    expect(
      [...fromMigrations].sort(),
      'Миграции выдают слушателю не то, что записано в LEARNER_RIGHTS_SNAPSHOT. Новое право ' +
        'слушателя — впишите в снимок и убедитесь, что тест ниже остался зелёным: каждое ' +
        'новое право слушателя заново открывает экраны, которые под ним стоят.'
    ).toEqual([...LEARNER_RIGHTS_SNAPSHOT].sort());
  });

  it('ни один экран сотрудника и ни один пункт меню не достижимы правами слушателя', () => {
    expect(
      staffScreensReachableByLearner(),
      'Эти экраны и пункты меню открыты правом, которое есть у роли learner, — слушатель ' +
        'увидит их в меню «Ещё». Если ручки экрана стоят под правом сотрудника ' +
        '(`documents.read`, `integrations.read`, …) — он упрётся в 403, тупик; если под тем ' +
        'же правом — увидит данные сотрудников. Поставьте экрану право его данных: то же, ' +
        'что на ручках бэкенда, которые экран вызывает (`features/<домен>/api.ts`). Экран, ' +
        'общий для всех ролей по праву, — впишите в `SHARED` с причиной, а не снимайте ' +
        'проверку. Так жили «Документы» и «Оперативная панель» (журнал 342, 343).'
    ).toEqual([]);
  });

  it('каждая запись SHARED ещё существует — мёртвых записей нет', () => {
    const { routes, nav } = readModel();
    const paths = new Set([...routes, ...nav].map((s) => s.path));
    for (const { path } of SHARED) {
      expect(
        paths.has(path),
        `${path} в SHARED, но такого экрана и пункта меню в карте больше нет — уберите запись`
      ).toBe(true);
    }
  });

  it('карта навигации прочитана целиком — незнакомая форма записи не молчит', () => {
    const { routes, nav, source } = readModel();
    const routeBody = arrayBody(source, 'routeMeta');
    const navBody = arrayBody(source, 'navigationModel');
    const publicRoutes = (routeBody.match(/public:\s*true/g) ?? []).length;
    // Каждый `pattern:` карты — либо разобранный непубличный экран, либо публичный.
    expect(routes.length + publicRoutes).toBe((routeBody.match(/pattern:/g) ?? []).length);
    expect(nav.length).toBe((navBody.match(/href:/g) ?? []).length);
    // Страховка от немого сторожа: экранов в карте больше восьмидесяти, пунктов меню — шестидесяти.
    expect(routes.length).toBeGreaterThanOrEqual(80);
    expect(nav.length).toBeGreaterThanOrEqual(60);
  });
});
