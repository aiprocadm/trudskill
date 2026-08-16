import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { APP_ROOT, fromApp } from './app-root';

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

const ROOTS = [fromApp('src', 'features'), fromApp('app')];
/** Подпись в данных: колонка таблицы, пункт меню, элемент словаря. */
const TITLE = /title: '([^']+)'/g;
/*
 * Подпись в разметке: заголовок карточки или страницы. Сторож среза 19 её НЕ ВИДЕЛ —
 * искал только запись в объекте. Из-за этого мимо прошли «CRM · Сделки», «Панель LMS»,
 * «KPI обучения», «Push-уведомления», «Бренд центра (white-label)» и — что хуже всего —
 * внутренние названия этапов проекта на экране пользователя: «Нормативные параметры
 * программы (Pillar A)», «Действия проверки — Plan C».
 */
const JSX_TITLE = /(?:title|subtitle)="([^"]+)"/g;

/** Названия форматов и стандартов — их не переводят. */
/* Плюс само название продукта: оно пишется латиницей по правилам бренда. */
const ALLOWED_EXACT = new Set(['SCORM', 'PDF', 'CSV', 'XML', 'XLSX', 'DOCX', 'trudskill']);

/**
 * Слова, которые допустимы ВНУТРИ русской подписи: названия форматов и внешних систем.
 * «Excel» здесь потому, что кнопка «Скачать в Excel» понятнее, чем «Скачать таблицу».
 */
const ALLOWED_WORDS = new Set(['SCORM', 'PDF', 'CSV', 'XML', 'XLSX', 'DOCX', 'Excel', 'trudskill']);

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

describe('заголовки колонок и карточек по-русски (TXT-006)', () => {
  const files = ROOTS.flatMap((root) => collect(root));

  it('сканер видит достаточно файлов — иначе зелёный ничего не значит', () => {
    expect(files.length).toBeGreaterThan(150);
  });

  it('ни один заголовок не написан только латиницей', () => {
    const offenders = files.flatMap((file) =>
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
});
