import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(__dirname, '../../../migrations/0068_communication_sms_provider_settings.sql'),
  'utf8'
);

/** Фаза 3 Task 5 (ФТ-C1.3): per-tenant настройки СМС-провайдера. */
describe('migration 0068', () => {
  it('создаёт таблицу настроек с tenant_id как первичным ключом', () => {
    expect(sql).toContain('communication.sms_provider_settings');
    expect(sql).toMatch(/tenant_id text PRIMARY KEY/);
  });

  it('по умолчанию канал спит — тенант, не покупавший СМС, ничего не шлёт', () => {
    expect(sql).toMatch(/provider_code text NOT NULL DEFAULT 'noop'/);
    expect(sql).toMatch(/enabled boolean NOT NULL DEFAULT false/);
  });

  it('НЕ хранит секретов — только код провайдера, имя отправителя и флаг', () => {
    // Ключи оператора живут в env/секрет-хранилище: выгрузка БД не должна становиться
    // выгрузкой платных доступов к СМС-шлюзу.
    expect(sql).not.toMatch(/api_key|api_token|secret|password/i);
    expect(sql).toContain('sender_name');
  });

  it('право sms.configure выдаётся только администрации — за СМС платит центр', () => {
    expect(sql).toContain("'sms.configure'");
    expect(sql).toMatch(/r\.code IN \('platform_admin', 'tenant_admin'\)/);
    expect(sql).not.toContain('methodist');
    expect(sql).not.toContain('learner');
  });

  it('идемпотентна: повторный накат не падает', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS');
    expect(sql).toContain('ON CONFLICT (id) DO NOTHING');
    expect(sql).toContain('ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING');
  });

  it('обёрнута в транзакцию — половина миграции хуже, чем её отсутствие', () => {
    expect(sql).toContain('BEGIN;');
    expect(sql).toContain('COMMIT;');
  });
});
