import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Изменение из нескольких записей доходит до базы целиком — или не доходит вовсе.
 *
 * Два отдельных запроса — это две отдельные транзакции: между ними приложение может упасть,
 * соединение оборваться, а вторая запись — не пройти по ограничению. Остаётся половина
 * сделанного, и она хуже, чем ничего:
 *
 *  - смена тарифа сначала снимает действующую подписку, потом заводит новую. Если второй шаг
 *    не прошёл, у центра НЕТ ТАРИФА ВОВСЕ: возможности закрыты, пределы не считаются, и центр
 *    стоит, пока кто-нибудь не заметит;
 *  - заказ на оплату пишется строкой заказа, а потом строками товаров по одной. Если оборвалось
 *    на середине, человек оплачивает заказ, в котором зачислений меньше, чем он купил.
 *
 * Транзакция здесь не «для порядка»: она и есть то, что делает изменение одним событием.
 *
 * Инвариант: метод, делающий две и более записи, идёт под `withTransaction` — либо записан
 * сюда с причиной, по которой половина изменения безопасна.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '..', '..');

/**
 * Методы с несколькими записями вне транзакции — с причиной.
 *
 * Причина обязана объяснять, почему половина сделанного не вредит: взаимоисключающие ветки,
 * повторяемая уборка, независимые строки.
 */
const ALLOWED: Record<string, string> = {
  'modules/communication/postgres-webinars.repository.ts upsertParticipantAttendance':
    'ветки взаимоисключающие: при найденном участнике идёт обновление и метод выходит, ' +
    'иначе — вставка; за один вызов выполняется РОВНО ОДНА запись'
};

/** SQL, который меняет данные. */
const WRITES = /\b(insert\s+into|update\s+[a-z_.]+\s+set|delete\s+from)\b/i;

const sourcesUnder = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      sourcesUnder(full, acc);
      continue;
    }
    if (entry.endsWith('.ts') && !entry.includes('.test.') && !entry.endsWith('.stub.ts')) {
      acc.push(full);
    }
  }
  return acc;
};

/** Тело блока, начинающегося фигурной скобкой в `open`. */
const blockAt = (source: string, open: number): string => {
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open, index + 1);
    }
  }
  return source.slice(open);
};

/** Текст аргументов вызова, чья открывающая скобка стоит в `open`. */
const callArguments = (source: string, open: number): string => {
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '(') depth += 1;
    if (source[index] === ')') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, index);
    }
  }
  return source.slice(open + 1);
};

type Method = { key: string; location: string; writes: number; underTransaction: boolean };

const methodsWithWrites = (): Method[] => {
  const found: Method[] = [];
  for (const file of sourcesUnder(SRC)) {
    const source = readFileSync(file, 'utf8');
    const relativeFile = relative(SRC, file).split('\\').join('/');
    for (const match of source.matchAll(
      /(?:async\s+)?([a-zA-Z_$][\w$]*)\s*\([^)]*\)\s*(?::[^{;]+)?\{/g
    )) {
      const open = source.indexOf('{', match.index + match[0].length - 1);
      if (open === -1) continue;
      const body = blockAt(source, open);
      // Огромные блоки — это класс целиком, а не метод: разбирать их здесь нечего.
      if (body.length > 20_000) continue;

      let writes = 0;
      for (const call of body.matchAll(/\.query\s*[<(]/g)) {
        const parenthesis = body.indexOf('(', call.index);
        if (parenthesis === -1) continue;
        if (WRITES.test(callArguments(body, parenthesis))) writes += 1;
      }
      if (writes < 2) continue;
      const line = source.slice(0, match.index).split('\n').length;
      found.push({
        key: `${relativeFile} ${match[1]}`,
        location: `${relativeFile}:${line}`,
        writes,
        // Под транзакцией пишут через выданного ею клиента.
        underTransaction: /withTransaction|client\.query|PoolClient/.test(body)
      });
    }
  }
  return found;
};

const methods = methodsWithWrites();

describe('изменение из нескольких записей доходит целиком', () => {
  /*
   * Поимённо, а не счётчиком (урок §5.426): при сломанном разборе список молча опустеет, и
   * сторож останется зелёным. Опорные места выбраны из тех, что УЖЕ пишут под транзакцией, —
   * они не исчезнут после починки нарушителей.
   */
  it('сторож видит методы с несколькими записями там, где они точно есть', () => {
    const files = new Set(methods.map((method) => method.key.split(' ')[0]!));
    for (const file of [
      'modules/mvp/infrastructure/postgres-mvp-persistence.backend.ts',
      'modules/communication/postgres-chat.repository.ts'
    ]) {
      expect(files.has(file), `методы с несколькими записями в ${file} не найдены`).toBe(true);
    }
  });

  it('метод с несколькими записями идёт под транзакцией', () => {
    const loose = methods
      .filter((method) => !method.underTransaction)
      .filter((method) => !(method.key in ALLOWED))
      .map((method) => `${method.location} — записей: ${method.writes}`);
    expect(loose, `изменений без транзакции: ${loose.length}`).toEqual([]);
  });

  it('список не протухает — записанный метод всё ещё пишет дважды', () => {
    const keys = new Set(methods.filter((m) => !m.underTransaction).map((m) => m.key));
    const gone = Object.keys(ALLOWED)
      .filter((key) => !keys.has(key))
      .map((key) => `${key} — записан в стороже, но столько записей там больше нет`);
    expect(gone).toEqual([]);
  });
});
