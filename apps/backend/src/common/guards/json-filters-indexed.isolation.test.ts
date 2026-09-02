import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Восьмой сторож семейства «объявлено — кто это исполняет», теперь про скорость:
 * **по чему фильтруем в JSON — по тому и индекс.**
 *
 * Сущности MVP и документов хранятся снимками: строка таблицы — это JSON в колонке `data`
 * (`docs/mvp-domain-database.md`). Поэтому обычные индексы по колонкам тут не работают —
 * нужны индексы по выражению, и проект их уже умеет делать (`0061`, слепой хэш СНИЛС).
 *
 * Беда в том, что фильтр по `data->>'x'` выглядит в коде так же дёшево, как фильтр по
 * колонке, а без индекса это полный перебор таблицы. Так и было (журнал 331):
 *   • публичная проверка документа по QR искала `data->>'qrToken'` **без арендатора** —
 *     а все индексы снимков начинаются с `tenant_id`, значит ни один не подходил. Полный
 *     перебор документов ВСЕХ центров на неаутентифицированной ручке;
 *   • проверка готовности считала очередь задач по `data->>'status'` — и делала это на
 *     КАЖДОМ опросе живости, то есть постоянно.
 *
 * Проверено подсадным нарушителем: новый фильтр по JSON-полю без индекса роняет тест.
 *
 * **Граница проверки, названная честно.** Сторож сверяет ИМЕНА полей, а не пары
 * «поле + коллекция»: как только индекс по `data->>'status'` появился для задач, поле
 * считается закрытым и для других коллекций. Сделать точнее значило бы разбирать условия
 * запросов всерьёз — это уже не регулярка, а разбор SQL. Здесь сторож ловит главное:
 * фильтр по полю, для которого индекса нет ВООБЩЕ.
 */

/**
 * Пробелы вокруг `->>` в SQL допустимы, и миграции их ставят: разбор обязан их терпеть,
 * иначе сторож не увидит собственный индекс и обвинит невиновных.
 */
const JSON_PATH = /data\s*->>\s*'([a-zA-Z]+)'/g;

const HERE = dirname(fileURLToPath(import.meta.url));
const BACKEND_SRC = resolve(HERE, '../..');
const MIGRATIONS = resolve(HERE, '../../../migrations');

interface UnindexedOnPurpose {
  path: string;
  why: string;
}

/**
 * JSON-пути, по которым фильтруют без индекса осознанно. Реестр решений, а не способ
 * погасить красный тест: каждая строка отвечает, почему перебор здесь допустим.
 */
const UNINDEXED_ON_PURPOSE: ReadonlyArray<UnindexedOnPurpose> = [
  {
    path: 'startedAt',
    why: "сборщик зависших задач сравнивает поле КАК ВРЕМЯ: `(data->>'startedAt')::timestamptz < now() - interval`. Приведение текста к timestamptz — stable, а не immutable, и такое выражение Postgres индексировать не даёт. Доиндексировать там и нечего: фильтр стоит поверх `status = 'running'`, после которого остаются единицы строк (индекс на status заведён миграцией 0090)"
  }
];

const sources = (dir: string): string[] => {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...sources(full));
      continue;
    }
    if (entry.endsWith('.ts') && !entry.includes('.test.')) files.push(full);
  }
  return files;
};

/**
 * JSON-пути, по которым код ФИЛЬТРУЕТ (в `where`), а не просто читает в списке колонок.
 * Читать поле в `select` дёшево — платит только чтение; фильтровать без индекса дорого.
 */
const filteredJsonPaths = (): Set<string> => {
  const paths = new Set<string>();
  for (const file of sources(BACKEND_SRC)) {
    const text = readFileSync(file, 'utf8');
    for (const query of text.matchAll(/`([^`]*?\bwhere\b[^`]*?)`/gis)) {
      const body = query[1] ?? '';
      const where = body.slice(body.toLowerCase().indexOf('where'));
      for (const match of where.matchAll(JSON_PATH)) {
        if (match[1]) paths.add(match[1]);
      }
    }
  }
  return paths;
};

/** JSON-пути, по которым в миграциях заведён индекс по выражению. */
const indexedJsonPaths = (): Set<string> => {
  const paths = new Set<string>();
  for (const entry of readdirSync(MIGRATIONS)) {
    if (!entry.endsWith('.sql')) continue;
    const sql = readFileSync(resolve(MIGRATIONS, entry), 'utf8').replace(/--[^\n]*/g, '');
    for (const index of sql.matchAll(/create\s+(?:unique\s+)?index[\s\S]*?;/gi)) {
      for (const match of (index[0] ?? '').matchAll(JSON_PATH)) {
        if (match[1]) paths.add(match[1]);
      }
    }
  }
  return paths;
};

describe('фильтр по JSON-полю опирается на индекс', () => {
  it('по каждому полю, по которому фильтруют, есть индекс по выражению', () => {
    const indexed = indexedJsonPaths();
    const explained = new Set(UNINDEXED_ON_PURPOSE.map((item) => item.path));

    const unindexed = [...filteredJsonPaths()]
      .filter((path) => !indexed.has(path) && !explained.has(path))
      .sort();

    expect(
      unindexed,
      'Код фильтрует по JSON-полю, для которого нет индекса по выражению. В снимках это ' +
        'полный перебор таблицы: в коде такой фильтр выглядит не дороже фильтра по колонке, ' +
        'а стоит на порядки больше. Либо заведите индекс (образец — `0061`), либо внесите ' +
        'поле в UNINDEXED_ON_PURPOSE с объяснением, почему перебор здесь допустим.'
    ).toEqual([]);
  });

  it('реестр не устарел', () => {
    const filtered = filteredJsonPaths();
    const stale = UNINDEXED_ON_PURPOSE.filter((item) => !filtered.has(item.path)).map(
      (i) => i.path
    );
    expect(stale, 'по этому полю больше не фильтруют — уберите строку из реестра').toEqual([]);
  });

  it('инвентарь вообще читается', () => {
    // Страховка от немого сторожа: пустые списки сделали бы проверку зелёной ни на чём.
    expect(filteredJsonPaths().size).toBeGreaterThan(1);
    expect(indexedJsonPaths().size).toBeGreaterThan(0);
  });
});
