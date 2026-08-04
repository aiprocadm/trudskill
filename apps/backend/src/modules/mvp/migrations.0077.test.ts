import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(__dirname, '../../../migrations/0077_core_rental_invoices.sql'),
  'utf8'
);

/** Тело без комментариев: пояснения «почему НЕ там» не должны ломать проверки «там». */
const ddl = sql
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');

/** Фаза 4 Task 6 (ФТ-D5.1): счета аренды и grace-период. */
describe('migration 0077', () => {
  it('счета аренды — отдельная платформенная таблица, не payments (D5.3)', () => {
    expect(ddl).toContain('CREATE TABLE IF NOT EXISTS core.rental_invoices');
    expect(ddl).not.toContain('payments.');
  });

  it('деньги — целые копейки, неотрицательные; период не вывернут', () => {
    expect(sql).toContain('amount_kopecks bigint NOT NULL');
    expect(sql).toContain('CHECK (amount_kopecks >= 0)');
    expect(sql).toContain('CHECK (period_end >= period_start)');
  });

  it('статусы зафиксированы CHECK, номер уникален на платформе', () => {
    expect(sql).toContain("CHECK (status IN ('issued', 'paid', 'cancelled'))");
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS uq_rental_invoices_number');
  });

  it('grace живёт в ТАРИФЕ (его правит платформа), а не в настройках тенанта', () => {
    expect(ddl).toContain('ALTER TABLE core.plans');
    expect(ddl).toContain('grace_working_days integer NOT NULL DEFAULT 10');
    expect(ddl).not.toContain('tenant_settings');
  });

  it('идемпотентна и обёрнута в транзакцию', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS');
    expect(sql).toContain('BEGIN;');
    expect(sql).toContain('COMMIT;');
  });
});
