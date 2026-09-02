import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * Седьмой сторож семейства «объявлено — кто это исполняет», теперь про базу:
 * **ограничение стоит на таблице, которой пользуется код.**
 *
 * Ограничение на мёртвой таблице — обман вдвойне: оно ничего не защищает И убеждает
 * читателя миграций, что данные защищены. Так и было (журнал 330):
 * `comm.webinar_attendees.attendance_status` под CHECK с 0014, а схема `comm` не используется
 * вовсе — девять таблиц, ноль строк, ноль обращений из кода. Живёт и пишется
 * `communication.webinar_participants`, и у неё ограничения не было НИКОГДА: код писал
 * `joined`/`left`, которых нет даже в словаре мёртвого близнеца.
 *
 * Проверка идёт по CHECK-ограничениям со списком значений: именно они кодируют доменное
 * правило и именно их обидно потерять. Внешние ключи и `not null` не трогаем — их
 * бессмысленность видна и без сторожа.
 *
 * Проверено подсадным нарушителем: CHECK на таблице, которой нет в коде, роняет тест.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const BACKEND_SRC = resolve(HERE, '../..');
const MIGRATIONS = resolve(HERE, '../../../migrations');

interface DeadOnPurpose {
  table: string;
  why: string;
}

/**
 * Таблицы под ограничением, которых нет в коде, — с ответом почему это законно.
 * Реестр решений, а не способ погасить красный тест.
 */
const ABANDONED_TWIN =
  'схема `comm` — заброшенный близнец `communication`: 9 таблиц, 0 строк, 0 обращений ' +
  'из кода (замерено 02.09.2026). Ограничение с 0014 не защищает ничего, а живая колонка ' +
  'получила своё миграцией 0089. Саму схему НЕ сношу: снос необратим и это отдельное ' +
  'решение владельца (журнал 330)';

const SNAPSHOT_STORAGE =
  'домены документов и MVP хранятся СНИМКАМИ: сущности лежат JSON-ом в ' +
  '`documents.runtime_documents` / `learning.mvp_runtime_documents` (описано в ' +
  'docs/mvp-domain-database.md). Нормализованная таблица спроектирована, но не пишется — ' +
  'её CHECK не защищает ничего. Это известное состояние, а не находка; строка здесь, чтобы ' +
  'сторож не молчал о нём и чтобы переход на нормализованное хранение не прошёл незаметно';

const DEAD_ON_PURPOSE: ReadonlyArray<DeadOnPurpose> = [
  { table: 'comm.webinar_attendees', why: ABANDONED_TWIN },
  { table: 'comm.webinars', why: ABANDONED_TWIN },
  { table: 'comm.notifications', why: ABANDONED_TWIN },
  { table: 'comm.notification_receipts', why: ABANDONED_TWIN },
  { table: 'documents.templates', why: SNAPSHOT_STORAGE },
  { table: 'documents.template_versions', why: SNAPSHOT_STORAGE },
  { table: 'documents.generated_documents', why: SNAPSHOT_STORAGE },
  { table: 'learning.course_versions', why: SNAPSHOT_STORAGE },
  { table: 'learning.materials', why: SNAPSHOT_STORAGE },
  { table: 'learning.progress', why: SNAPSHOT_STORAGE },
  { table: 'integrations.credentials', why: SNAPSHOT_STORAGE },
  { table: 'integrations.sync_logs', why: SNAPSHOT_STORAGE },
  { table: 'integrations.webhook_events', why: SNAPSHOT_STORAGE }
];

/** Таблицы, на которые миграции вешают CHECK со списком значений. */
const tablesWithValueChecks = (): Set<string> => {
  const tables = new Set<string>();
  for (const entry of readdirSync(MIGRATIONS)) {
    if (!entry.endsWith('.sql')) continue;
    const sql = readFileSync(resolve(MIGRATIONS, entry), 'utf8').replace(/--[^\n]*/g, '');
    for (const match of sql.matchAll(
      /alter\s+table\s+(?:if\s+exists\s+)?([a-z_]+\.[a-z_]+)[\s\S]{0,400}?check\s*\([a-z_]+\s+in\s*\(/gi
    )) {
      if (match[1]) tables.add(match[1].toLowerCase());
    }
  }
  return tables;
};

/** Таблицы, к которым код действительно обращается. */
const tablesUsedByCode = (): Set<string> => {
  const used = new Set<string>();
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = resolve(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.endsWith('.ts') || entry.includes('.test.')) continue;
      for (const match of readFileSync(full, 'utf8').matchAll(/\b([a-z_]+\.[a-z_]+)\b/g)) {
        if (match[1]) used.add(match[1].toLowerCase());
      }
    }
  };
  walk(BACKEND_SRC);
  return used;
};

describe('ограничение стоит на живой таблице', () => {
  it('у каждой таблицы под CHECK есть обращения из кода', () => {
    const used = tablesUsedByCode();
    const explained = new Set(DEAD_ON_PURPOSE.map((item) => item.table));

    const dead = [...tablesWithValueChecks()]
      .filter((table) => !used.has(table) && !explained.has(table))
      .sort();

    expect(
      dead,
      'CHECK-ограничение стоит на таблице, к которой код не обращается. Такое ограничение ' +
        'обманывает вдвойне: ничего не защищает и убеждает читателя миграций, что данные ' +
        'под защитой. Либо перенесите ограничение на живую таблицу, либо внесите её в ' +
        'DEAD_ON_PURPOSE с объяснением, почему мёртвая таблица здесь законна.'
    ).toEqual([]);
  });

  it('реестр не устарел: записанная таблица всё ещё под ограничением и всё ещё мертва', () => {
    const constrained = tablesWithValueChecks();
    const used = tablesUsedByCode();

    const vanished = DEAD_ON_PURPOSE.filter((item) => !constrained.has(item.table)).map(
      (i) => i.table
    );
    expect(vanished, 'ограничения на этой таблице больше нет — уберите строку').toEqual([]);

    const revived = DEAD_ON_PURPOSE.filter((item) => used.has(item.table)).map((i) => i.table);
    expect(
      revived,
      'таблица снова используется — уберите строку, реестр вводит в заблуждение'
    ).toEqual([]);
  });

  it('инвентарь вообще читается', () => {
    // Страховка от немого сторожа: пустые списки сделали бы проверку зелёной ни на чём.
    expect(tablesWithValueChecks().size).toBeGreaterThan(3);
    expect(tablesUsedByCode().size).toBeGreaterThan(20);
  });
});
