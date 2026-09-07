import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const HERE = dirname(fileURLToPath(import.meta.url));
const SQL = readFileSync(
  join(HERE, '../../../migrations/0092_org_training_licenses_unique_number.sql'),
  'utf-8'
);

/**
 * Журнал 353: обещание «две лицензии с одним номером не заведутся» подперто базой.
 *
 * Проверка в коде (`findByTypeAndNumber` перед вставкой) — две операции, между которыми
 * проходит время. Держит обещание только ограничение базы.
 */
describe('migration 0092 — уникальность номера лицензии', () => {
  it('заводит уникальность по центру, типу и номеру', () => {
    expect(SQL).toMatch(
      /CREATE\s+UNIQUE\s+INDEX\s+IF\s+NOT\s+EXISTS\s+uq_training_licenses_tenant_type_number/i
    );
    expect(SQL).toMatch(
      /ON\s+org\.training_licenses\s*\(\s*tenant_id\s*,\s*license_type\s*,\s*license_number\s*\)/i
    );
  });

  it('ищет существующие дубли ДО создания индекса и называет их поимённо', () => {
    // Иначе миграция падает невнятным сообщением Postgres про «could not create unique index»,
    // и администратор платформы не знает, какие записи разводить.
    expect(SQL).toMatch(/group\s+by\s+tenant_id,\s*license_type,\s*license_number/i);
    expect(SQL).toMatch(/having\s+count\(\*\)\s*>\s*1/i);
    expect(SQL).toMatch(/raise\s+exception/i);
    expect(SQL.indexOf('raise exception')).toBeLessThan(SQL.indexOf('CREATE UNIQUE INDEX'));
  });

  it('статус в набор не входит — номер занят и архивной лицензией', () => {
    // Проверка в коде статус тоже не учитывает: архивная лицензия не перестаёт существовать
    // в отчётности. Правило берётся у кода, а не придумывается заново.
    expect(SQL).not.toMatch(/\(\s*tenant_id\s*,\s*license_type\s*,\s*license_number\s*,\s*status/i);
  });

  it('объясняет себя комментарием в базе', () => {
    expect(SQL).toMatch(/COMMENT\s+ON\s+INDEX\s+org\.uq_training_licenses_tenant_type_number/i);
  });
});
