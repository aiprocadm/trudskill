import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

import { APP_ROOT, fromApp, fromPackages } from './app-root';

/**
 * `BR-020` выкатка N+1: прежние ключи хранения удалены и не возвращаются.
 *
 * При ребрендинге ключи браузера и cookie переименовали (`cdoprof.*` → `trudskill.*`). Между
 * двумя выкатками код читал ОБА имени, чтобы не выбросить тех, кто уже вошёл. Окно закрыто:
 * прежние имена больше не читаются, не пишутся и не гасятся.
 *
 * Сторож раньше сторожил СРОК (молчал до даты, потом краснел). Теперь сторожит результат:
 * ни одного прежнего имени в коде. Это не то же самое, что «мы их удалили» — удалить легко,
 * а вот вернуть ветку `?? readCookie(..., 'cdoprof_...')` при отладке или откате ещё легче,
 * и жила бы она в самом чувствительном месте: сессия, защита от подделки запроса, права.
 *
 * Имя бакета `cdoprof-dev` в настройках воркера — не текст, а ДАННЫЕ: по `BR-030` такое
 * остаётся как есть, поэтому оно перечислено исключением с причиной, а не «просто пропущено».
 */

const ROOTS = [fromApp('src'), fromApp('app'), fromPackages('ui', 'src')];
const BACKEND_SRC = join(APP_ROOT, '..', 'backend', 'src');
const WORKER_SRC = join(APP_ROOT, '..', 'worker', 'src');

/**
 * Места, где прежнее имя ЗАКОННО. Список закрытый и с причиной у каждой строки: без причины
 * исключение через год не отличить от недоделанной уборки.
 */
const ALLOWED: Record<string, string> = {
  'apps/worker/src/env.ts':
    'имя бакета хранилища `cdoprof-dev` — существующие ДАННЫЕ, а не текст интерфейса; ' +
    'переименование потребовало бы переноса файлов при нулевой пользе (`BR-030`)'
};

/**
 * Каталоги, где прежнее имя — это имя ЧУЖОЙ системы, а не наш ключ хранения. Ключ — путь
 * каталога от корня репозитория; причина обязательна, как и у файлов выше.
 */
const ALLOWED_DIRS: Record<string, string> = {
  'apps/backend/src/modules/import-cdoprof/':
    'ТЗ перехода с CDOPROF (§15.2, МГ-K3.1): модуль импорта из ВНЕШНЕЙ системы-источника, ' +
    'имя которой и есть предмет модуля — API-клиент, фикстуры и выгрузка носят его в путях ' +
    'файлов; к ключам браузера и cookie (`BR-020`) это не относится'
};

const allowedByDir = (name: string): boolean =>
  Object.keys(ALLOWED_DIRS).some((dir) => name.startsWith(dir));

const sources = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry === 'dist') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      sources(full, acc);
      continue;
    }
    if (/\.tsx?$/.test(entry)) acc.push(full);
  }
  return acc;
};

/**
 * Исходник без комментариев: пояснения про переезд («прежнее имя больше не читается»)
 * законны и обязаны остаться — иначе следующий агент не поймёт, почему тут так.
 */
const codeOnly = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

/*
 * Образец собран из кусков: написанный целиком, он встречался бы в этом же файле, и сторож
 * ловил бы сам себя. Та же грабля уже была со сторожем диалогов и сторожем путей.
 */
const BRAND = ['cdo', 'prof'].join('');

const files = [...ROOTS, BACKEND_SRC, WORKER_SRC].flatMap((root) => sources(root));

describe('BR-020 · прежние ключи хранения не возвращаются', () => {
  it('исходники вообще найдены', () => {
    expect(files.length).toBeGreaterThan(500);
  });

  it('прежнего имени нет в коде — кроме перечисленных исключений с причиной', () => {
    const found = files
      .filter((file) => !file.includes('.test.'))
      .filter((file) => codeOnly(readFileSync(file, 'utf8')).includes(BRAND))
      .map((file) => relative(join(APP_ROOT, '..', '..'), file));

    expect(
      found.filter((name) => !(name in ALLOWED) && !allowedByDir(name)),
      'прежнее имя вернулось в код: чтение под старым ключом переживает выкатку молча'
    ).toEqual([]);
  });

  it('список исключений не протухает — каждое всё ещё существует', () => {
    const stale = Object.keys(ALLOWED).filter(
      (name) => !files.some((file) => file.endsWith(name.replace('apps/', '')))
    );
    expect(stale, 'исключение указывает на файл, которого нет').toEqual([]);
  });
});
