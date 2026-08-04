import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(__dirname, '../../../migrations/0076_core_plans_subscriptions.sql'),
  'utf8'
);

/** Фаза 4 Task 5 (ФТ-D4): тарифы и лимиты аренды. */
describe('migration 0076', () => {
  it('заводит core.plans с лимитами (null = безлимит) и флагами features', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS core.plans');
    expect(sql).toContain('active_learners_limit integer NULL');
    expect(sql).toContain('staff_limit integer NULL');
    expect(sql).toContain('storage_limit_bytes bigint NULL');
    expect(sql).toMatch(/features jsonb NOT NULL DEFAULT '\{\}'::jsonb/);
  });

  it('одна АКТИВНАЯ подписка на тенанта — частичный unique, отменённые копятся историей', () => {
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS uq_tenant_subscriptions_active');
    expect(sql).toMatch(/WHERE status = 'active'/);
    expect(sql).toContain("CHECK (status IN ('active', 'cancelled'))");
  });

  it('право tenant.usage.read — администрации центра, не методисту и не слушателю', () => {
    const grant = sql.slice(sql.indexOf('INSERT INTO iam.role_permissions'));
    expect(grant).toContain("r.code IN ('platform_admin', 'tenant_admin')");
    expect(grant).not.toContain("'methodist'");
    expect(grant).not.toContain("'learner'");
  });

  it('идемпотентна и обёрнута в транзакцию', () => {
    expect(sql).toContain('ON CONFLICT (id) DO NOTHING');
    expect(sql).toContain('ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING');
    expect(sql).toContain('BEGIN;');
    expect(sql).toContain('COMMIT;');
  });
});
