import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { APP_ROOT, fromApp } from './app-root';

/**
 * У списочной ручки записана ФОРМА ответа — тестом, а не только типом.
 *
 * Что случилось. `listOtTrainingPrograms` был объявлен как «массив программ», а сервер отдавал
 * `{ items: [...] }` — как и справочник актов рядом. Тип обещал одно, приходило другое, и на
 * экране курса `otPrograms?.map(...)` падал с «map is not a function», унося ВСЮ страницу в
 * красный экран. Заметили это по жалобе владельца, а не тестом: проверки на эту ручку просто
 * не было написано.
 *
 * Почему тип не спасает. `tsc` сверяет вызов с ТЕМ, ЧТО НАПИСАНО в аннотации, а не с тем, что
 * присылает сервер. Аннотация — это утверждение о чужом поведении, и проверить его может
 * только тест, где форма ответа выписана целиком.
 *
 * Поэтому правило: у каждого вызова, объявленного массивом, есть контрактный тест, называющий
 * его адрес. Такой тест заставляет автора выписать ответ руками — а выписывая, он смотрит на
 * настоящий ответ сервера.
 */

const SOURCE = fromApp('src');

const sources = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      sources(full, acc);
      continue;
    }
    if (/\.tsx?$/.test(entry)) acc.push(full);
  }
  return acc;
};

const files = sources(SOURCE);
const contractTests = files
  .filter((f) => f.endsWith('.contract.test.ts'))
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');

/** Исходник без комментариев: пример в пояснении — не вызов. */
const codeOnly = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

/**
 * Вызовы, объявленные голым массивом: `apiRequest<Тип[]>('/адрес'…)`.
 *
 * Адрес с подстановкой (`/users/${id}/roles`) сводится к неизменяемому началу: по нему тест
 * и ищется, иначе шаблонная строка не совпала бы ни с чем никогда.
 */
const listCalls = files
  .filter((f) => !f.includes('.test.'))
  .flatMap((file) => {
    const code = codeOnly(readFileSync(file, 'utf8'));
    return [...code.matchAll(/apiRequest<[^>]*\[\]>\(\s*[`'"]([^`'"$]*)/g)].map((m) => ({
      file: relative(APP_ROOT, file),
      path: m[1] ?? ''
    }));
  })
  .filter((c) => c.path.startsWith('/') && c.path.length > 2);

describe('форма списочного ответа записана тестом', () => {
  it('списочные вызовы вообще найдены', () => {
    /* Сломайся разбор — список опустеет, и требование стало бы зелёным ни на чём. */
    expect(listCalls.length).toBeGreaterThanOrEqual(15);
  });

  it('у каждого списочного вызова есть контрактный тест с его адресом', () => {
    const uncovered = [
      ...new Set(
        listCalls.filter((c) => !contractTests.includes(c.path)).map((c) => `${c.path} (${c.file})`)
      )
    ].sort();

    expect(
      uncovered,
      'форма ответа не выписана ни одним тестом: расхождение с сервером обнаружится на экране человека, а не здесь'
    ).toEqual([]);
  });
});
