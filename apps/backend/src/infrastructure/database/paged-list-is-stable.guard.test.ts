import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Список, который листают, отдаёт строки в ОДНОМ И ТОМ ЖЕ порядке.
 *
 * `order by created_at desc limit 50 offset 50` — это не полный порядок: у строк с одинаковым
 * `created_at` взаимный порядок не определён, и база вправе вернуть их по-разному на каждой
 * странице. Человек листает журнал и видит одну и ту же запись дважды, а другую — ни разу.
 *
 * Ничьи здесь не редкость, а норма. `created_at` по умолчанию — `now()`, а `now()` в Postgres
 * это время НАЧАЛА ТРАНЗАКЦИИ: все строки, вставленные одной транзакцией, получают ОДИН И ТОТ
 * ЖЕ момент. Массовое зачисление на двести человек, рассылка на двести адресов, выпуск пакета
 * документов — каждое такое действие кладёт в журнал пачку строк с одинаковым временем. Чем
 * больше центр, тем чаще человек видит расползающийся список — и тем меньше доверия журналу,
 * по которому разбирают спор.
 *
 * Лечится одним: последним в сортировке идёт поле, которое ни у каких двух строк не совпадает
 * (`id`). Тогда порядок полный, и страницы не перекрываются.
 *
 * Инвариант: у каждого запроса, который читают постранично (`limit` вместе с `offset`),
 * сортировка заканчивается разводящим полем — либо место записано сюда с причиной.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '..', '..');

/**
 * Постраничные запросы без разводящего поля — с причиной.
 *
 * Пусто: ревизия 2026-09-07 разобрала очередь до конца. Это НЕ разрешение — чтобы попасть
 * сюда, нужна причина, по которой ничья невозможна или безразлична.
 */
const ALLOWED: Record<string, string> = {};

/** Поле, которое не совпадает ни у каких двух строк. */
const TIEBREAKER = /\bid\b\s*(asc|desc)?\s*$/i;

const sourcesUnder = (dir: string, acc: string[] = []): string[] => {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      sourcesUnder(full, acc);
      continue;
    }
    if (entry.endsWith('.ts') && !entry.includes('.test.')) acc.push(full);
  }
  return acc;
};

type PagedQuery = { location: string; order: string };

const pagedQueries = (): PagedQuery[] => {
  const found: PagedQuery[] = [];
  for (const file of sourcesUnder(SRC)) {
    const source = readFileSync(file, 'utf8');
    const relativeFile = relative(SRC, file).split('\\').join('/');
    for (const match of source.matchAll(/`([^`]*order\s+by[^`]*)`/gis)) {
      const sql = match[1]!.replace(/\s+/g, ' ');
      if (!/\blimit\b/i.test(sql) || !/\boffset\b/i.test(sql)) continue;
      const order = /order\s+by\s+(.*?)(?:\s+limit\b|\s+offset\b|$)/i.exec(sql);
      if (!order) continue;
      const line = source.slice(0, match.index).split('\n').length;
      found.push({ location: `${relativeFile}:${line}`, order: order[1]!.trim() });
    }
  }
  return found;
};

const queries = pagedQueries();

describe('постраничный список отдаёт строки в одном и том же порядке', () => {
  /*
   * Не счётчик «не меньше N», а поимённый список (урок §5.426): если разбор сломается — скажем,
   * SQL начнут собирать не шаблонной строкой, — счётчик молча уменьшится, и сторож останется
   * зелёным на пустоте.
   */
  it('сторож видит постраничные запросы там, где они точно есть', () => {
    const files = new Set(queries.map((query) => query.location.split(':')[0]!));
    for (const file of [
      'modules/audit/audit.service.ts',
      'modules/communication/postgres-email-deliveries.repository.ts',
      'modules/communication/postgres-chat.repository.ts',
      'modules/communication/postgres-webinars.repository.ts'
    ]) {
      expect(files.has(file), `постраничный запрос в ${file} не найден`).toBe(true);
    }
    expect(queries.length).toBeGreaterThanOrEqual(6);
  });

  it('сортировка каждого постраничного запроса заканчивается разводящим полем', () => {
    const unstable = queries
      .filter((query) => !TIEBREAKER.test(query.order))
      .filter((query) => !(query.location in ALLOWED))
      .map((query) => `${query.location} — order by ${query.order}`);
    expect(unstable, `нестойких списков: ${unstable.length}`).toEqual([]);
  });

  it('список не протухает — записанное место всё ещё постраничное', () => {
    const places = new Set(queries.map((query) => query.location));
    const gone = Object.keys(ALLOWED)
      .filter((place) => !places.has(place))
      .map((place) => `${place} — записан в стороже, но такого запроса больше нет`);
    expect(gone).toEqual([]);
  });
});
