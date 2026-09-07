import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { APP_ROOT, fromApp, fromPackages } from './app-root';

/**
 * Заголовок колонки или карточки не написан латиницей (`TXT-006`).
 *
 * Срез 19 нашёл целый пласт: колонки «Name», «Status», «Secret», «Provider», «Creds»,
 * «Active creds», «Last sync» на экране обмена данными; «Session ID» в карточке сотрудника;
 * пять колонок «ID» в историях выгрузок; тринадцать заголовков виджетов стартовых экранов
 * («Continue learning», «Deadlines», «At risk learners») — при русских пояснениях под ними.
 *
 * Имена стандартов и форматов (SCORM, PDF, CSV, XML, XLSX) — не перевод, а название:
 * они разрешены, но только как часть подписи, а не вся подпись целиком.
 */

const ROOTS = [fromApp('src', 'features'), fromApp('app'), fromPackages('ui', 'src')];
/*
 * §5.435: общий пакет компонентов смотрится наравне с приложением. Правило кончалось на
 * границе `apps/frontend`, а человек этой границы не видит: подписи состояний, кнопок и
 * предупреждений рисует `@trudskill/ui`, и до ревизии их не проверял никто.
 */
/*
 * Подпись в данных: колонка таблицы, пункт меню, элемент словаря. `label:` добавлен
 * срезом 3 фазы 5: плитка показателя писала «Drop-off», а сторож видел только `title:` —
 * ещё одна форма записи той же подписи (урок «какими ЕЩЁ способами это пишется?»).
 */
const TITLE = /(?:title|label): '([^']+)'/g;
/*
 * Подпись в разметке: заголовок карточки или страницы. Сторож среза 19 её НЕ ВИДЕЛ —
 * искал только запись в объекте. Из-за этого мимо прошли «CRM · Сделки», «Панель LMS»,
 * «KPI обучения», «Push-уведомления», «Бренд центра (white-label)» и — что хуже всего —
 * внутренние названия этапов проекта на экране пользователя: «Нормативные параметры
 * программы (Pillar A)», «Действия проверки — Plan C».
 */
const JSX_TITLE = /(?:title|subtitle)="([^"]+)"/g;

/**
 * Подписи, которых сторож НЕ смотрел до ревизии 2026-09-08 (§5.434) — третья форма той же
 * записи: текст-подсказка поля, пункт выпадающего списка и пояснение пустого экрана.
 *
 * Именно через них на экран попали «Base URL» вместо подписи поля (текст-подсказка исчезает,
 * едва человек начинает печатать, — значит подписи не было вовсе) и пояснения пустых
 * экранов с внутренними названиями этапов проекта: «Plans B+C добавят попытки и активные
 * действия», «Plan C добавит submission/review lifecycle».
 */
const OTHER_LABELS = [
  /placeholder(?:=["']|:\s*')([^"']{3,80})["']/g,
  /(?:message|hint|emptyLabel|ariaLabel|aria-label)(?:=["']|:\s*')([^"']{3,120})["']/g,
  /<option[^>]*>([^<{][^<]{2,80})<\/option>/g
];

/**
 * Латиница, которая ОБРАЗЕЦ, а не подпись, — с причиной.
 *
 * Текст-подсказка показывает, что именно вводить: ссылку, адрес почты, код латиницей. Перевод
 * образца сделал бы его бесполезным — человек вводит ровно то, что видит.
 */
const ALLOWED_SAMPLES: Record<string, string> = {
  'https://…/logo.png': 'образец ссылки на логотип — человек вводит ссылку, а не слово',
  'https://webinar.example.ru': 'образец адреса сервиса вебинаров',
  'curator@example.ru': 'образец адреса почты',
  'my-center': 'образец кода центра: код вводится латиницей по правилам платформы',
  basic: 'образец кода тарифа: коды тарифов латинские',
  'XML (XSD 1.0.3)': 'название стандарта выгрузки — его не переводят'
};

/** Названия форматов и стандартов — их не переводят. */
/* Плюс само название продукта: оно пишется латиницей по правилам бренда. */
const ALLOWED_EXACT = new Set(['SCORM', 'PDF', 'CSV', 'XML', 'XLSX', 'DOCX', 'trudskill']);

/**
 * Слова, которые допустимы ВНУТРИ русской подписи: названия форматов и внешних систем.
 * «Excel» здесь потому, что кнопка «Скачать в Excel» понятнее, чем «Скачать таблицу».
 */
const ALLOWED_WORDS = new Set([
  'SCORM',
  'PDF',
  'CSV',
  'XML',
  'XLSX',
  'DOCX',
  'Excel',
  'trudskill',
  // §5.434: расширения файлов встречаются и строчными («.docx», «Zip-файл») — это то же
  // название формата, а не другое слово.
  'ZIP',
  'PNG',
  'JPG',
  'SVG'
]);

/** Название формата — независимо от того, как оно записано: «XLSX», «xlsx», «Zip». */
const isAllowedWord = (word: string): boolean =>
  ALLOWED_WORDS.has(word) || ALLOWED_WORDS.has(word.toUpperCase());

/**
 * Витрина компонентов — экран для разработчика, а не для администратора центра:
 * там названия компонентов пакета и есть содержание. Единственное исключение.
 */
const EXCEPTIONS = new Set(['src/features/ui-kit/gallery-screen.tsx']);

const collect = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collect(full, acc);
      continue;
    }
    if (full.endsWith('.tsx') && !full.includes('.test.')) acc.push(full);
  }
  return acc;
};

const latinTitles = (file: string): string[] => {
  const source = readFileSync(file, 'utf8');
  const found: string[] = [];
  for (const match of source.matchAll(TITLE)) {
    const value = match[1] ?? '';
    if (ALLOWED_EXACT.has(value)) continue;
    // Подпись считается русской, если в ней есть кириллица: «Учебные пакеты (SCORM)» — годится.
    if (/[А-Яа-яЁё]/.test(value)) continue;
    // Строки без букв вовсе (например, «№») не о языке.
    if (!/[A-Za-z]/.test(value)) continue;
    found.push(value);
  }
  return found;
};

/**
 * Заголовки в разметке проверяются строже: латинское слово ловится и ВНУТРИ русской фразы.
 * Именно так на экраны попали «CRM · Сделки» и «(Pillar A)» — кириллица рядом была, а слово
 * всё равно оставалось непонятным.
 */
const latinWordsInMarkup = (file: string): string[] => {
  const source = readFileSync(file, 'utf8');
  const found: string[] = [];
  for (const match of source.matchAll(JSX_TITLE)) {
    const value = match[1] ?? '';
    // Подстановки вида title={`…${x}`} сюда не попадают: в них значение считается во время работы.
    if (value.includes('{')) continue;
    for (const word of value.match(/\b[A-Za-z][A-Za-z0-9]+\b/g) ?? []) {
      if (ALLOWED_WORDS.has(word)) continue;
      found.push(`${value} (слово «${word}»)`);
    }
  }
  return found;
};

/** Латиница в подписи, которая не заголовок: подсказка поля, пункт списка, пустой экран. */
const latinInOtherLabels = (file: string): string[] => {
  const source = readFileSync(file, 'utf8');
  const found: string[] = [];
  for (const pattern of OTHER_LABELS) {
    for (const match of source.matchAll(pattern)) {
      const value = (match[1] ?? '').trim();
      if (!value || value.includes('{')) continue;
      if (value in ALLOWED_SAMPLES) continue;
      // Слово латиницей внутри русской фразы ловится так же, как в заголовках разметки.
      for (const word of value.match(/\b[A-Za-z][A-Za-z0-9]+\b/g) ?? []) {
        if (isAllowedWord(word)) continue;
        found.push(`${value} (слово «${word}»)`);
      }
    }
  }
  return found;
};

describe('заголовки колонок и карточек по-русски (TXT-006)', () => {
  const files = ROOTS.flatMap((root) => collect(root));

  it('сканер видит достаточно файлов — иначе зелёный ничего не значит', () => {
    expect(files.length).toBeGreaterThan(150);
  });
  /*
   * Прямая проверка, что общий пакет ДЕЙСТВИТЕЛЬНО просматривается (урок §5.426): счётчик
   * файлов приложения перевалит порог и без пакета, поэтому сломанный путь остался бы
   * незамеченным — сторож был бы зелёным на неполном списке.
   */
  it('сканер видит и общий пакет компонентов, а не только приложение', () => {
    const fromPackage = files.filter((file) =>
      file.split('\\').join('/').includes('/packages/ui/src/')
    );
    expect(fromPackage.length, 'файлы `@trudskill/ui` в список не попали').toBeGreaterThan(5);
  });

  it('ни один заголовок не написан только латиницей', () => {
    const offenders = files
      .filter((file) => !EXCEPTIONS.has(relative(APP_ROOT, file).replace(/\\/g, '/')))
      .flatMap((file) =>
        latinTitles(file).map(
          (title) => `${relative(APP_ROOT, file).replace(/\\/g, '/')}: «${title}»`
        )
      );
    expect(offenders, 'заголовок латиницей — человеку он ничего не говорит').toEqual([]);
  });

  it('в заголовках разметки нет латинских слов и внутренних названий этапов', () => {
    const offenders = files
      .filter((file) => !EXCEPTIONS.has(relative(APP_ROOT, file).replace(/\\/g, '/')))
      .flatMap((file) =>
        latinWordsInMarkup(file).map(
          (title) => `${relative(APP_ROOT, file).replace(/\\/g, '/')}: «${title}»`
        )
      );
    expect(
      offenders,
      'латинское слово в заголовке экрана — администратору центра оно ничего не говорит'
    ).toEqual([]);
  });
  /*
   * §5.434, третья форма той же записи. Заголовки сторож смотрел с самого начала, `label:`
   * добавлен срезом 3 фазы 5, разметка — тем же срезом. Подсказка поля, пункт списка и
   * пояснение пустого экрана не смотрелись ни разу — и именно там осталось «Base URL» вместо
   * подписи и внутренние названия этапов проекта в пояснениях пустых экранов.
   */
  it('в подсказках, пунктах списков и пустых экранах нет латинских слов', () => {
    const offenders = files
      .filter((file) => !EXCEPTIONS.has(relative(APP_ROOT, file).replace(/\\/g, '/')))
      .flatMap((file) =>
        latinInOtherLabels(file).map(
          (text) => `${relative(APP_ROOT, file).replace(/\\/g, '/')}: «${text}»`
        )
      );
    expect(offenders, `подписей латиницей: ${offenders.length}`).toEqual([]);
  });

  it('у каждого разрешённого образца записана причина', () => {
    // Иначе список образцов превращается в способ заглушить сторожа.
    const vague = Object.entries(ALLOWED_SAMPLES)
      .filter(([, why]) => why.trim().length < 20)
      .map(([sample]) => sample);
    expect(vague).toEqual([]);
  });
});
