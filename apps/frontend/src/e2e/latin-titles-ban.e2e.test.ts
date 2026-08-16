import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

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

const ROOTS = ['src/features', 'app'];
const TITLE = /title: '([^']+)'/g;

/** Названия форматов и стандартов — их не переводят. */
/* Плюс само название продукта: оно пишется латиницей по правилам бренда. */
const ALLOWED_EXACT = new Set(['SCORM', 'PDF', 'CSV', 'XML', 'XLSX', 'DOCX', 'trudskill']);

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

describe('заголовки колонок и карточек по-русски (TXT-006)', () => {
  const files = ROOTS.flatMap((root) => collect(root));

  it('сканер видит достаточно файлов — иначе зелёный ничего не значит', () => {
    expect(files.length).toBeGreaterThan(150);
  });

  it('ни один заголовок не написан только латиницей', () => {
    const offenders = files.flatMap((file) =>
      latinTitles(file).map((title) => `${file.replace(/\\/g, '/')}: «${title}»`)
    );
    expect(offenders, 'заголовок латиницей — человеку он ничего не говорит').toEqual([]);
  });
});
