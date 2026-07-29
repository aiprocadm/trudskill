import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const sql = readFileSync(join(__dirname, '../../../migrations/0069_learning_consents.sql'), 'utf8');

/** Фаза 3 Task 6 (ФТ-C3.2): раздельные согласия на ПДн и на фото. */
describe('migration 0069', () => {
  it('заводит версионируемый текст согласия с хэшем — как соглашение ПЭП в 0067', () => {
    expect(sql).toContain('learning.consent_documents');
    expect(sql).toMatch(/version integer NOT NULL/);
    expect(sql).toMatch(/body_hash text NOT NULL/);
    expect(sql).toContain('PRIMARY KEY (tenant_id, kind, version)');
  });

  it('знает ровно два вида согласия и не даёт завести третий незаметно', () => {
    expect(sql).toMatch(/consent_documents_kind_chk CHECK \(kind IN \('personal_data', 'photo'\)\)/);
    expect(sql).toMatch(/consent_facts_kind_chk CHECK \(kind IN \('personal_data', 'photo'\)\)/);
  });

  it('факт согласия привязан к слушателю и хранит отзыв, а не удаляется', () => {
    expect(sql).toContain('learning.consent_facts');
    expect(sql).toMatch(/learner_id text NOT NULL/);
    expect(sql).toMatch(/revoked_at timestamptz NULL/);
    expect(sql).not.toMatch(/DELETE FROM learning\.consent_facts/);
  });

  it('переносит существующий consent_at как согласие на ПДн', () => {
    expect(sql).toMatch(/INSERT INTO learning\.consent_facts[\s\S]*'personal_data'[\s\S]*FROM learning\.identity_verifications/);
    expect(sql).toContain('v.consent_at IS NOT NULL');
  });

  it('согласие на фото переносит ТОЛЬКО там, где фото реально загружено', () => {
    // Иначе согласие, которого человек не давал, появилось бы задним числом.
    const photoInsert = sql.slice(sql.indexOf("'photo', v.consent_at"));
    expect(photoInsert).toContain('v.selfie_file_id IS NOT NULL');
  });

  it('исторические согласия не притворяются подписанными под конкретный текст', () => {
    expect(sql).toMatch(/document_version integer NULL/);
    expect(sql).toMatch(/body_hash text NULL/);
  });

  it('право consent.configure выдаётся только администрации центра', () => {
    expect(sql).toContain("'consent.configure'");
    expect(sql).toMatch(/r\.code IN \('platform_admin', 'tenant_admin'\)/);
  });

  it('идемпотентна: повторный накат не падает и не дублирует переносы', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS');
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS');
    expect(sql).toContain('ON CONFLICT (id) DO NOTHING');
    expect(sql).toMatch(/NOT EXISTS \(\s*SELECT 1 FROM learning\.consent_facts/);
  });

  it('обёрнута в транзакцию — половина миграции хуже, чем её отсутствие', () => {
    expect(sql).toContain('BEGIN;');
    expect(sql).toContain('COMMIT;');
  });
});
