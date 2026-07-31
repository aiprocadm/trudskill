import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(__dirname, '../../../migrations/0072_core_tenants_status_check.sql'),
  'utf8'
);

/** Фаза 4 Task 2 (ФТ-D2.1): жизненный цикл тенанта фиксируется на уровне БД. */
describe('migration 0072', () => {
  it('фиксирует ровно четыре статуса жизненного цикла тенанта', () => {
    expect(sql).toMatch(/CHECK \(status IN \('trial', 'active', 'suspended', 'archived'\)\)/);
  });

  it('мусорный статус приводится к suspended (fail-closed), а не к active', () => {
    // Неизвестное состояние не должно держать тенанта работающим: ошибочно
    // приостановленного вернёт админ платформы, ошибочно активированный — это
    // чужие данные без оплаты и договора.
    const normalize = sql.slice(sql.indexOf('UPDATE core.tenants'), sql.indexOf('ALTER TABLE'));
    expect(normalize).toContain("SET status = 'suspended'");
    expect(normalize).toMatch(/WHERE status NOT IN \('trial', 'active', 'suspended', 'archived'\)/);
  });

  it('нормализация идёт ДО добавления ограничения — иначе ADD CONSTRAINT упал бы на живой базе', () => {
    expect(sql.indexOf('UPDATE core.tenants')).toBeLessThan(
      sql.indexOf('ADD CONSTRAINT core_tenants_status_check')
    );
  });

  it('идемпотентна и обёрнута в транзакцию', () => {
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS core_tenants_status_check');
    expect(sql).toContain('BEGIN;');
    expect(sql).toContain('COMMIT;');
  });
});
