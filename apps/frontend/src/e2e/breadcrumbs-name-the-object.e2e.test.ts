import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { fromApp } from './app-root';
import { stripComments } from './backend-source';
import {
  CABINET_ROOT,
  buildBreadcrumbs,
  looksLikeId,
  pageLabels
} from '../features/navigation/breadcrumbs';
import { navigationModel } from '../features/navigation/model';

/**
 * Хлебные крошки называют объект (ТЗ «Стабилизация, UX и развитие», 3.5 / Н5).
 *
 * **Как было.** Карточки заканчивались словом «Карточка» («Группы / Карточка» вместо «Группы /
 * Группа 360px»). Вложенные адреса печатали идентификаторы и служебные слова: «Мои тесты /
 * test_vc8sf4k5 / attempt / Карточка», «Настройки и система / platform / Арендаторы платформы».
 * У слушателя крошки начинались с блока администратора: «Главная / Документы и удостоверения /
 * Мой кабинет / Мои документы».
 *
 * **Почему так вышло.** Крошки собирались из одного адреса, а имя объекта знает только экран
 * карточки — оболочке негде было его взять. Словарь подписей был привязан к слову-сегменту, а
 * не к странице: `new` называлось «Создание» и для курса, и для группы, а сегменты без своей
 * страницы получали подпись и становились ссылкой в никуда.
 *
 * **Что закреплено.**
 *
 * 1. У каждой страницы оболочки есть своя последняя крошка — проверяется по РЕАЛЬНОМУ дереву
 *    `app/`, а не по списку в тесте: новая страница без имени покраснеет сама.
 * 2. Ни одна подпись — не сырой сегмент адреса и не идентификатор.
 * 3. Каждый экран карточки называет свой объект (`useObjectCrumb`) — иначе скелетон в крошке
 *    останется навсегда.
 * 4. Подпись страницы без пункта меню равна её заголовку — одно имя, как в 3.4.
 * 5. Оболочка действительно берёт имя из хранилища и рисует скелетон, пока его нет.
 *
 * Без React Testing Library (CLAUDE.md): чистая функция крошек + проверка исходников.
 */

const APP = fromApp('app');
const FEATURES = fromApp('src', 'features');
const SHELL = fromApp('src', 'widgets', 'shell', 'app-shell.tsx');
const HOOK = fromApp('src', 'features', 'navigation', 'use-object-crumb.ts');
const SHELL_STYLES = fromApp('..', '..', 'packages', 'ui', 'src', 'styles', 'shell.ts');

const read = (file: string): string => stripComments(readFileSync(file, 'utf8'));

type Page = { route: string; file: string; code: string };

const collectPages = (dir: string, route: string, out: Page[]): void => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectPages(full, `${route}/${entry}`, out);
    } else if (entry === 'page.tsx') {
      out.push({ route: route || '/', file: full, code: read(full) });
    }
  }
};

/** Страницы, которые рисуются в оболочке: с `ProtectedPage` и не редирект. */
const shellPages = (): Page[] => {
  const pages: Page[] = [];
  collectPages(APP, '', pages);
  return pages
    .filter((page) => page.code.includes('<ProtectedPage'))
    .filter((page) => !(/\bredirect\(/.test(page.code) && !/return\s*\(/.test(page.code)))
    .sort((a, b) => a.route.localeCompare(b.route));
};

/** `[id]` → `item_1a2b3c4d`, `[testId]` → `test_1a2b3c4d`: родной формат идентификаторов. */
const sampleRoute = (route: string): string =>
  route.replace(/\[([^\]]+)\]/g, (_, name: string) => {
    const stem = name.toLowerCase().replace(/id$/, '') || 'item';
    return `${stem}_1a2b3c4d`;
  });

const isCardRoute = (route: string): boolean => route.includes('[');

/** Исходники, до которых страница дотягивается относительными импортами внутри `src/features`. */
const reachableSources = (file: string, depth = 3, seen = new Set<string>()): string[] => {
  if (seen.has(file) || depth < 0) return [];
  seen.add(file);
  const out = [file];
  const code = readFileSync(file, 'utf8');
  for (const match of code.matchAll(/from\s+'(\.[^']+)'/g)) {
    const base = resolve(dirname(file), match[1]!);
    const candidate = [
      `${base}.tsx`,
      `${base}.ts`,
      join(base, 'index.tsx'),
      join(base, 'index.ts')
    ].find((path) => existsSync(path));
    if (!candidate || !candidate.startsWith(FEATURES)) continue;
    out.push(...reachableSources(candidate, depth - 1, seen));
  }
  return out;
};

const CYRILLIC = /[а-яё]/i;

/**
 * Значение общей строковой константы по её имени.
 *
 * Читается из исходника, а не импортируется: сторож разбирает файлы как текст и остаётся
 * независимым от того, что и куда переэкспортировано.
 */
const sharedLabelValue = (name: string): string | null => {
  const label = read(fromApp('src', 'features', 'support', 'problem-report.ts'));
  const match = new RegExp(`export const ${name} = '([^']+)'`).exec(label);
  return match?.[1] ?? null;
};

describe('хлебные крошки называют объект (ТЗ 3.5)', () => {
  it('у каждой страницы оболочки есть своя последняя крошка — по реальному дереву app/', () => {
    const missing: string[] = [];
    for (const page of shellPages()) {
      /* «/» — диспетчер входа (служебный адрес по ТЗ 3.4): крошек у него нет по замыслу. */
      if (page.route === '/') continue;
      const sample = sampleRoute(page.route);
      const last = buildBreadcrumbs(sample).at(-1);
      if (!last || last.href !== sample) {
        missing.push(
          `${page.route} → ${last ? `«${last.label}» (${last.href ?? 'без ссылки'})` : 'крошек нет'}`
        );
        continue;
      }
      if (isCardRoute(page.route) ? !last.pending : !last.label) missing.push(page.route);
    }
    expect(
      missing,
      'страница без своей крошки: либо у неё нет пункта меню и подписи в pageLabels, либо её ' +
        'идентификатор не распознан как идентификатор'
    ).toEqual([]);
  });

  it('ни одна подпись — не сырой сегмент адреса, не идентификатор и не «Главная»', () => {
    const raw: string[] = [];
    expect(buildBreadcrumbs('/'), '«/» — диспетчер входа, у него нет крошек').toEqual([]);
    for (const page of shellPages()) {
      const sample = sampleRoute(page.route);
      const segments = new Set(sample.split('/').filter(Boolean));
      for (const crumb of buildBreadcrumbs(sample)) {
        if (crumb.href === '/') raw.push(`${page.route}: «Главная» — второе имя домашнего раздела`);
        if (crumb.pending) continue;
        if (!CYRILLIC.test(crumb.label) || segments.has(crumb.label) || looksLikeId(crumb.label)) {
          raw.push(`${page.route}: «${crumb.label}»`);
        }
      }
    }
    expect(raw, 'человек читает крошки, а не адресную строку').toEqual([]);
  });

  it('у кабинета слушателя своя иерархия — первая крошка «Мой кабинет», без блоков', () => {
    const cabinetRoot = navigationModel.find((item) => item.href === CABINET_ROOT);
    expect(cabinetRoot, 'корень кабинета обязан быть пунктом меню').toBeDefined();
    const wrong: string[] = [];
    for (const page of shellPages()) {
      if (page.route !== CABINET_ROOT && !page.route.startsWith(`${CABINET_ROOT}/`)) continue;
      const first = buildBreadcrumbs(sampleRoute(page.route))[0];
      if (first?.href !== CABINET_ROOT) wrong.push(`${page.route} → «${first?.label ?? ''}»`);
    }
    expect(
      wrong,
      'слушателю не нужны блоки администратора («Документы и удостоверения») перед его кабинетом'
    ).toEqual([]);
  });

  it('каждый экран карточки называет свой объект — иначе скелетон в крошке навсегда', () => {
    const silent: string[] = [];
    for (const page of shellPages()) {
      if (!isCardRoute(page.route)) continue;
      const publishes = reachableSources(page.file).some((file) =>
        /\buseObjectCrumb\s*\(/.test(read(file))
      );
      if (!publishes) silent.push(page.route);
    }
    expect(
      silent,
      'экран карточки обязан вызвать useObjectCrumb(имя, { notFound, failed }) до первого return'
    ).toEqual([]);
  });

  it('подпись страницы без пункта меню равна её заголовку', () => {
    const pages = new Map(shellPages().map((page) => [page.route, page]));
    const mismatched: string[] = [];
    for (const [route, label] of Object.entries(pageLabels)) {
      const page = pages.get(route);
      if (!page) {
        mismatched.push(`${route}: страницы в оболочке нет — подпись мертва`);
        continue;
      }
      /*
       * Заголовок совпадает с крошкой либо буквально, либо ЧЕРЕЗ ОБЩУЮ КОНСТАНТУ.
       *
       * Второй случай появился с ТЗ 15.5: имя страницы «Сообщить о проблеме» живёт в одном
       * месте и используется и в меню человека, и в крошке, и в заголовке. Требовать здесь
       * именно литерал значило бы заставить вписать это имя третий раз — то есть завести
       * ровно то расхождение, от которого сторож и защищает (журнал 583).
       *
       * Инвариант не ослаблен: имя по-прежнему обязано быть одним. Изменилось только то, что
       * «одно имя» теперь может быть общей константой, а не тремя одинаковыми строками.
       */
      const titled = reachableSources(page.file).some((file) => {
        const source = read(file);
        if (source.includes(`title="${label}"`)) return true;
        const viaConstant = /title={([A-Z_][A-Z0-9_]*)}/.exec(source)?.[1];
        return Boolean(viaConstant && sharedLabelValue(viaConstant) === label);
      });
      if (!titled) mismatched.push(`${route}: заголовок страницы ≠ «${label}»`);
    }
    expect(mismatched, 'одно имя у раздела: в крошке то же, что в заголовке (ТЗ 3.4)').toEqual([]);
  });

  it('оболочка берёт имя из хранилища и рисует скелетон, пока его нет', () => {
    const shell = read(SHELL);
    expect(
      /useSyncExternalStore\(\s*subscribeObjectCrumb/.test(shell),
      'оболочка обязана быть подписана на хранилище имени объекта'
    ).toBe(true);
    expect(
      /buildBreadcrumbs\(\s*pathname,\s*objectCrumb\s*\)/.test(shell),
      'имя объекта обязано попадать в сборку крошек — иначе хранилище есть, а крошка пустая'
    ).toBe(true);
    const pendingAt = shell.indexOf('crumb.pending ?');
    expect(pendingAt, 'скелетон рисуется по признаку pending').toBeGreaterThan(-1);
    expect(shell.slice(pendingAt, pendingAt + 400)).toMatch(/role="status"/);
    expect(read(SHELL_STYLES)).toContain('.app-shell__crumb-skeleton');
  });

  it('уход с экрана снимает имя — иначе оно всплывёт на следующей карточке', () => {
    const hook = read(HOOK);
    expect(/return\s*\(\)\s*=>\s*retractObjectCrumb\(pathname\)/.test(hook)).toBe(true);
  });
});
