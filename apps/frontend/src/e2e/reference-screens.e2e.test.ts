import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { stripComments } from './backend-source';

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

/**
 * Эталонная страница → файлы, из которых она собрана (обёртка + экран).
 *
 * **Состав расширен до восьми (ТЗ 16.6).** ТЗ просит 8–10 эталонных экранов и называет
 * поимённо: список слушателей, карточка курса, экран экзамена, стартовый экран слушателя,
 * настройки. Первые пять сюда попали в срезе по метрикам (`MET-001`, ТЗ §13.3), остальные
 * добавлены здесь: без карточки курса и экрана экзамена под присмотром оставались ровно те
 * места, где человек проводит больше всего времени.
 */
const REFERENCE_SCREENS: Record<string, string[]> = {
  '/workspace': ['app/workspace/page.tsx'],
  '/learners': ['app/learners/page.tsx', 'src/features/learners/learners-list-screen.tsx'],
  '/learners/[id]': [
    'app/learners/[id]/page.tsx',
    'src/features/learners/learner-detail-screen.tsx'
  ],
  '/settings': ['app/settings/page.tsx', 'src/features/settings/settings-screen.tsx'],
  '/login': ['app/login/page.tsx', 'src/features/auth/login-form.tsx'],
  // ТЗ 16.6: «карточка курса» — там методист проводит большую часть рабочего дня.
  '/courses/[id]': ['app/courses/[id]/page.tsx', 'src/features/courses/courses-screens.tsx'],
  // ТЗ 16.6: «стартовый экран слушателя» — первое, что видит учащийся после входа.
  /*
   * Кабинет слушателя собран из нескольких частей: сам экран задаёт рамку, а подписи
   * блоков живут в его составляющих. Без них слепок вышел бы почти пустым — сторож это
   * и показал, потребовав не меньше трёх подписей на эталонную страницу.
   */
  '/learner': [
    'app/learner/page.tsx',
    'src/features/learner-home/learner-home-screen.tsx',
    'src/features/learner-home/my-courses-list.tsx',
    'src/features/learner-home/more-in-learning.tsx'
  ],
  // ТЗ 16.6: «экран экзамена» — место, где ошибка вёрстки стоит человеку результата.
  '/learner/tests': [
    'app/learner/tests/page.tsx',
    'src/features/test-player/tests-list-screen.tsx',
    'src/features/test-player/test-attempt-screen.tsx'
  ]
};

/**
 * Где в экранах разрешён «сырой» цвет — и почему.
 *
 * Это недостающее звено между слепком состава и измерением контраста. Контрасты обеих тем
 * меряются по токенам (`packages/ui/src/tokens/contrast-audit.test.ts`, `UI-001`), но эта
 * гарантия распространяется на экран ТОЛЬКО пока экран рисует токенами. Первый же цвет,
 * вписанный числом, из-под измерения выпадает — и именно он станет невидимым в тёмной теме.
 *
 * Сегодня таких мест три, и все три — не оформление:
 */
const RAW_COLOR_ALLOWED: Record<string, string> = {
  'src/features/branding/branding-section.tsx':
    'значения по умолчанию для выбора фирменных цветов центра: это ДАННЫЕ, которые человек меняет, а не оформление экрана',
  'app/layout.tsx':
    'цвет строки браузера (`theme-color`) — его читает операционная система, а не наши стили',
  'src/features/course-viewer/video-watermark-overlay.tsx':
    'полупрозрачная подложка водяного знака поверх видео: она обязана быть одинаковой в обеих темах, иначе знак пропадает на светлом кадре'
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

/**
 * Недостающее звено между слепком состава и измерением контраста (ТЗ 16.6).
 *
 * **Почему это и есть замена пиксельным снимкам.** Скриншоты ловят прежде всего один класс
 * беды: в тёмной теме текст сливается с фоном. Этот класс уже измеряется — попарно, числом, в
 * обеих темах (`packages/ui/src/tokens/contrast-audit.test.ts`, `UI-001`). Но та гарантия
 * распространяется на экран ТОЛЬКО пока экран рисует токенами: первый же цвет, вписанный
 * числом, из-под измерения выпадает — и именно он станет невидимым в тёмной теме.
 *
 * **Чего эта проверка НЕ ловит:** отступы, шрифты, съехавшую вёрстку. Это остаётся за
 * пиксельными снимками, а их ввод — решение владельца: браузера (Playwright) в проекте нет ни
 * в зависимостях, ни в CI, а сам CI не запускался с мая. Снимки, которые никогда не
 * прогоняются, — бутафория, и записывать их как сделанные нельзя (журнал 548).
 */
describe('эталонные экраны рисуют токенами, а не числами (ТЗ 16.6)', () => {
  const RAW_COLOR = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![0-9a-fA-F])|rgba?\(\s*\d/;

  it('ни один эталонный экран не задаёт цвет числом', () => {
    const offenders: string[] = [];

    for (const [route, files] of Object.entries(REFERENCE_SCREENS)) {
      for (const file of files) {
        if (file in RAW_COLOR_ALLOWED) continue;
        const full = join(FRONTEND, file);
        if (!existsSync(full)) continue;
        /* Комментарии снимаются: «§5.493» в пояснении — не цвет (проверено на этом же файле). */
        const source = stripComments(readFileSync(full, 'utf8'));
        if (RAW_COLOR.test(source)) offenders.push(`${route}: ${file}`);
      }
    }

    expect(
      offenders.sort(),
      'цвет числом выпадает из измерения контраста — и он же становится невидимым в тёмной теме'
    ).toEqual([]);
  });

  it('у каждого разрешённого места записана причина', () => {
    const withoutReason = Object.entries(RAW_COLOR_ALLOWED)
      .filter(([, why]) => why.trim().length < 20)
      .map(([file]) => file);
    expect(withoutReason, 'исключение без причины превращает реестр в свалку').toEqual([]);
  });

  it('реестр исключений не протух: файл существует и цвет в нём действительно есть', () => {
    /*
     * Обратная сторона реестра. Разрешение, пережившее свой файл, тихо прикрывало бы новый
     * хардкод, попавший в файл с тем же именем.
     */
    for (const [file, why] of Object.entries(RAW_COLOR_ALLOWED)) {
      const full = join(FRONTEND, file);
      expect(existsSync(full), `${file}: разрешение есть, а файла нет`).toBe(true);
      expect(
        RAW_COLOR.test(stripComments(readFileSync(full, 'utf8'))),
        `${file}: разрешение больше не нужно — цвета числом там нет («${why.slice(0, 40)}…»)`
      ).toBe(true);
    }
  });
});
