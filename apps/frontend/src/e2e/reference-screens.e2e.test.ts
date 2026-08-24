import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * `MET-001` · пять эталонных страниц под присмотром.
 *
 * ТЗ §13.3 называет пятёрку под приоритет администратора: `/workspace`, `/learners`,
 * `/learners/[id]`, `/settings`, `/login` — и предлагает снимать с них **визуальные**
 * снапшоты Playwright.
 *
 * ⚠️ Playwright в проекте нет: ни в зависимостях, ни в CI. Вводить браузерный стек —
 * решение владельца (новая зависимость, время в CI, хранение картинок), и молча принимать
 * его в рамках среза по метрикам неправильно. Поэтому здесь снимается то, что можно снять
 * честно и без браузера: **состав экрана**.
 *
 * Что попадает в слепок: заголовок и подзаголовок страницы, первичное и второстепенные
 * действия, названия блоков, колонки таблиц, тексты пустых состояний. Это ровно те вещи,
 * которые правит редизайн, и ровно те, чью пропажу пиксельный снимок ловит криком, а
 * человек на ревью — не всегда.
 *
 * Чего слепок НЕ ловит: цвета, отступы, шрифты, съехавшую вёрстку. Это остаётся за
 * визуальными снимками, и требование `MET-001` до их появления закрыто **частично** —
 * так и записано в трекере, чтобы никто не считал картинки сделанными.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const FRONTEND = join(HERE, '..', '..');

/** Эталонная страница → файлы, из которых она собрана (обёртка + экран). */
const REFERENCE_SCREENS: Record<string, string[]> = {
  '/workspace': ['app/workspace/page.tsx'],
  '/learners': ['app/learners/page.tsx', 'src/features/learners/learners-list-screen.tsx'],
  '/learners/[id]': [
    'app/learners/[id]/page.tsx',
    'src/features/learners/learner-detail-screen.tsx'
  ],
  '/settings': ['app/settings/page.tsx', 'src/features/settings/settings-screen.tsx'],
  '/login': ['app/login/page.tsx', 'src/features/auth/login-form.tsx']
};

const uniq = (items: string[]): string[] => [...new Set(items)].sort();

/** Берём первую заполненную группу: у шаблонов есть ветка `"строка"` и ветка `{`строка`}`. */
const matchAll = (source: string, re: RegExp): string[] =>
  [...source.matchAll(re)]
    .map((m) => m.slice(1).find((group) => typeof group === 'string' && group.trim() !== ''))
    .filter((value): value is string => Boolean(value))
    .map((value) => value.trim());

/** Состав экрана: то, что человек читает и на что нажимает. */
const outlineOf = (files: string[]): Record<string, string[]> => {
  const source = files
    .map((file) => join(FRONTEND, file))
    .filter((full) => existsSync(full))
    .map((full) => readFileSync(full, 'utf8'))
    .join('\n');

  return {
    /*
     * Заголовок страницы. Ветка со строкой — постоянная подпись; заголовок-выражение
     * (`title={fullName || 'Слушатель'}`) значением в слепок не идёт: оно зависит от
     * данных, и подставлять его — врать. Пишем, что заголовок вычисляется.
     */
    'заголовок страницы': uniq(
      matchAll(source, /<PageHeader\s+title="([^"]+)"/g)
        .concat(matchAll(source, /<h1[^>]*>([^<>{}]+)<\/h1>/g))
        .concat(/<PageHeader\s+title=\{/.test(source) ? ['(вычисляется из данных)'] : [])
    ),
    'первичное действие': uniq(
      matchAll(source, /primaryAction:\s*\{\s*label:\s*'([^']+)'/g).concat(
        matchAll(source, /primaryAction=\{\{\s*label:\s*'([^']+)'/g)
      )
    ),
    блоки: uniq(matchAll(source, /<SectionCard[^>]*?title=(?:"([^"]+)"|\{`([^`]+)`\})/g)),
    колонки: uniq(matchAll(source, /title:\s*'([^']+)'/g)),
    /*
     * Честное имя раздела. Сюда попадают и подписи действий строки, и подписи полей
     * карточки (`KeyValueList`) — в коде это одна и та же запись `label:`. Разделить их
     * без разбора дерева нельзя, а называть подписи полей «действиями» — обман: первая
     * версия слепка так и сделала, и в «действиях» карточки слушателя оказались «Почта»
     * и «Заведён».
     */
    'подписи (действия строк и поля карточек)': uniq(matchAll(source, /label:\s*'([^']+)'/g)),
    'пустые состояния': uniq(
      matchAll(source, /emptyMessage=(?:"([^"]+)")/g).concat(matchAll(source, /message="([^"]+)"/g))
    ),
    кнопки: uniq(matchAll(source, /\n\s*([^<>{}\n]{2,40}?)\s*\n\s*<\/button>/g))
  };
};

describe('MET-001 · состав эталонных страниц под снимком', () => {
  it('файлы всех пяти эталонных страниц на месте', () => {
    const missing = Object.entries(REFERENCE_SCREENS).flatMap(([route, files]) =>
      files.filter((file) => !existsSync(join(FRONTEND, file))).map((file) => `${route} → ${file}`)
    );

    expect(
      missing,
      `эталонная страница переехала — поправьте REFERENCE_SCREENS:\n${missing.join('\n')}`
    ).toEqual([]);
  });

  it('состав экранов не менялся молча', () => {
    const outline = Object.fromEntries(
      Object.entries(REFERENCE_SCREENS).map(([route, files]) => [route, outlineOf(files)])
    );

    // Снимок читается человеком: в дифе видно, какой блок, какая колонка или какое
    // действие пропало. Обновлять его следует осознанно — вместе с правкой экрана.
    expect(outline).toMatchSnapshot();
  });

  it('снимок не пустой — иначе он ничего не стережёт', () => {
    for (const [route, files] of Object.entries(REFERENCE_SCREENS)) {
      const outline = outlineOf(files);
      const total = Object.values(outline).reduce((sum, list) => sum + list.length, 0);
      expect(total, `у эталонной страницы ${route} не нашлось ни одной подписи`).toBeGreaterThan(2);
    }
  });
});
