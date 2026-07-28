import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(__dirname, '../../../migrations/0064_learning_video_assets_upload.sql'),
  'utf8'
);

/** Фаза 2 Task 2 (ФТ-B1.1): ассет помнит файл и незавершённую загрузку по частям. */
describe('migration 0064', () => {
  it('добавляет ссылку на storage.files — через неё работает антивирусный гейт', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS file_id text NULL');
  });

  it('добавляет идентификатор многочастной загрузки — без него нечем её отменить', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS multipart_upload_id text NULL');
  });

  it('обе колонки nullable: у провайдерской ветки ни файла, ни загрузки у нас нет', () => {
    expect(sql).not.toMatch(/ADD COLUMN IF NOT EXISTS \w+ text NOT NULL/);
  });

  it('аддитивна и обёрнута в транзакцию', () => {
    expect(sql).toContain('ALTER TABLE learning.video_assets');
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN)/i);
    expect(sql).toContain('BEGIN;');
    expect(sql).toContain('COMMIT;');
  });
});
