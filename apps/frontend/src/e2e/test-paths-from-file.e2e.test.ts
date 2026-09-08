import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { APP_ROOT, fromApp } from './app-root';

/**
 * Тест читает файлы по пути ОТ СЕБЯ, а не от текущего каталога.
 *
 * У набора два штатных запуска с разным `cwd`: `pnpm test:frontend` из корня репозитория и
 * `vitest` из `apps/frontend`. Тест с `process.cwd()` при одном падает с `ENOENT`, при другом
 * проходит — то есть его результат зависит от способа запуска, а не от кода. Хуже второй
 * исход: путь «случайно» находится в корне монорепозитория, и проверка тихо смотрит на чужой
 * файл.
 *
 * Грабля описана в `CLAUDE.md` и уже вскрывалась однажды (срез 21 — сторожа обходили весь
 * монорепозиторий). Она возвращается, потому что `process.cwd()` короче и локально работает.
 * Поэтому запрет, а не памятка: путь берётся из `APP_ROOT`/`fromApp`, посчитанных от файла.
 */

const SOURCE = fromApp('src');

const testFiles = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      testFiles(full, acc);
      continue;
    }
    if (/\.test\.tsx?$/.test(entry)) acc.push(full);
  }
  return acc;
};

/** Исходник без комментариев: пояснение «не берите cwd» не должно ловить само себя. */
const codeOnly = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

/*
 * Образец собран из кусков нарочно: написанный целиком, он встречался бы в этом же файле —
 * и сторож ловил бы сам себя. Такое уже случалось со сторожем диалогов.
 */
const FORBIDDEN = new RegExp(['process', '\\.', 'cwd', '\\(\\)'].join(''));

const files = testFiles(SOURCE);

describe('пути в тестах считаются от файла, а не от текущего каталога', () => {
  it('тесты вообще найдены', () => {
    /* Сломайся обход — список стал бы пустым, и запрет прошёл бы «зелёным» ни на чём. */
    expect(files.length).toBeGreaterThan(100);
  });

  it('ни один тест не берёт путь от текущего каталога', () => {
    const guilty = files
      .filter((file) => FORBIDDEN.test(codeOnly(readFileSync(file, 'utf8'))))
      .map((file) => relative(APP_ROOT, file));
    expect(guilty).toEqual([]);
  });
});
