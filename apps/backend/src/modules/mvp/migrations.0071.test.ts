import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(__dirname, '../../../migrations/0071_iam_counterparty_representative.sql'),
  'utf8'
);

/** Фаза 4 Task 1 (ФТ-E5): роль представителя заказчика и привязка к контрагенту. */
describe('migration 0071', () => {
  it('заводит привязку пользователя к контрагенту', () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS counterparty_id text NULL/);
  });

  it('контрагент обязан быть ИЗ ТОГО ЖЕ тенанта — композитный внешний ключ', () => {
    // Без tenant_id в ключе пользователя можно было бы привязать к контрагенту чужого
    // центра, и скоуп сам стал бы каналом утечки.
    expect(sql).toMatch(/FOREIGN KEY \(tenant_id, counterparty_id\)/);
    expect(sql).toMatch(/REFERENCES crm\.counterparties \(tenant_id, id\)/);
  });

  it('заводит роль представителя заказчика', () => {
    expect(sql).toContain("'counterparty_rep'");
  });

  it('представителю НЕ выдаются права на справочники центра', () => {
    // counterparties.read/groups.read/learners.read отдают данные по ВСЕМУ центру —
    // ровно то, что представитель видеть не должен.
    const repGrant = sql.slice(sql.indexOf('INSERT INTO iam.role_permissions'));
    expect(repGrant).toMatch(/p\.code = 'portal\.read' AND r\.code = 'counterparty_rep'/);
    expect(repGrant).not.toMatch(/counterparties\.read'\s*AND r\.code = 'counterparty_rep'/);
    expect(repGrant).not.toMatch(/learners\.read'\s*AND r\.code = 'counterparty_rep'/);
  });

  it('заводит ОТДЕЛЬНОЕ право портала, а не переиспользует counterparties.read', () => {
    expect(sql).toContain("'portal.read'");
  });

  it('идемпотентна и обёрнута в транзакцию', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS');
    expect(sql).toContain('DROP CONSTRAINT IF EXISTS');
    expect(sql).toContain('ON CONFLICT (id) DO NOTHING');
    expect(sql).toContain('BEGIN;');
    expect(sql).toContain('COMMIT;');
  });
});
