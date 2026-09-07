import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const SQL = readFileSync(
  join(HERE, '../../../migrations/0093_communication_webinar_participant_unique.sql'),
  'utf-8'
);

/**
 * Журнал 356: участник вебинара не задваивается.
 *
 * Проверка «есть такой участник?» и вставка — две операции; два одновременных входа одного
 * человека давали две строки участия, а по ним считают часы присутствия, которые идут в
 * документ об обучении.
 */
describe('migration 0093 — уникальность участника вебинара', () => {
  it('заводит по индексу на каждый вид участника, только по заполненным строкам', () => {
    // Один составной индекс по обеим колонкам не подошёл бы: в Postgres NULL не равен NULL,
    // и строки с пустой колонкой считались бы разными.
    expect(SQL).toMatch(
      /CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+uq_webinar_participants_learner[\s\S]*?\(\s*tenant_id\s*,\s*webinar_id\s*,\s*learner_id\s*\)[\s\S]*?WHERE\s+learner_id\s+IS\s+NOT\s+NULL/i
    );
    expect(SQL).toMatch(
      /CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+uq_webinar_participants_user[\s\S]*?\(\s*tenant_id\s*,\s*webinar_id\s*,\s*user_id\s*\)[\s\S]*?WHERE\s+user_id\s+IS\s+NOT\s+NULL/i
    );
  });

  it('существующие дубли сливает, а не удаляет вслепую', () => {
    // У оставшейся строки берутся самые полные значения присутствия — иначе миграция
    // потеряла бы факт: человек был на вебинаре дольше, чем осталось записано.
    expect(SQL).toMatch(/min\(joined_at\)/i);
    expect(SQL).toMatch(/max\(left_at\)/i);
    expect(SQL).toMatch(/max\(duration_seconds\)/i);
    // Сначала перенос значений, потом удаление лишних.
    expect(SQL.indexOf('min(joined_at)')).toBeLessThan(SQL.indexOf('delete from'));
  });

  it('слияние объявляется в журнале миграции, а не проходит молча', () => {
    expect(SQL).toMatch(/raise\s+notice/i);
  });

  it('индексы объясняют себя комментарием в базе', () => {
    expect(SQL).toMatch(/COMMENT\s+ON\s+INDEX\s+communication\.uq_webinar_participants_learner/i);
    expect(SQL).toMatch(/COMMENT\s+ON\s+INDEX\s+communication\.uq_webinar_participants_user/i);
  });
});
