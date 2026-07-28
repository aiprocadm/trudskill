import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(__dirname, '../../../migrations/0063_learning_video_assets.sql'),
  'utf8'
);

/** Фаза 2 Task 1 (ФТ-B1.1): шов видео-провайдера и сущность видео-ассета. */
describe('migration 0063', () => {
  it('создаёт таблицу видео-ассетов с жизненным циклом', () => {
    expect(sql).toContain('learning.video_assets');
    for (const status of ['uploading', 'processing', 'ready', 'failed']) {
      expect(sql).toContain(status);
    }
    expect(sql).toContain('video_assets_status_chk');
  });

  it('длительность и ключ хранилища допускают null — они появляются только после обработки', () => {
    expect(sql).toMatch(/duration_seconds integer NULL/);
    expect(sql).toMatch(/storage_key text NULL/);
  });

  it('индексирует поиск по тенанту и материалу, а вебхук — по идентификатору провайдера', () => {
    expect(sql).toContain('idx_video_assets_tenant_material');
    expect(sql).toContain('idx_video_assets_provider_asset_id');
  });

  it('создаёт таблицу настроек провайдера per tenant', () => {
    expect(sql).toContain('learning.video_provider_settings');
    expect(sql).toContain("provider_code text NOT NULL DEFAULT 'noop'");
  });

  it('заводит три права и не даёт слушателю загружать видео', () => {
    for (const code of ['video.read', 'video.write', 'video.configure']) {
      expect(sql).toContain(code);
    }
    const writeGrant = /p\.code = 'video\.write' AND r\.code IN \(([^)]*)\)/.exec(sql);
    expect(writeGrant).not.toBeNull();
    expect(writeGrant![1]).not.toContain('learner');
  });

  it('идемпотентна и обёрнута в транзакцию', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS');
    expect(sql).toContain('ON CONFLICT');
    expect(sql).toContain('BEGIN;');
    expect(sql).toContain('COMMIT;');
  });
});
