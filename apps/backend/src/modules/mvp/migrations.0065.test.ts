import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(__dirname, '../../../migrations/0065_learning_video_progress.sql'),
  'utf8'
);

/** Фаза 2 Task 6 (ФТ-B3.1/B3.3): покрытие ролика и позиция возобновления. */
describe('migration 0065', () => {
  it('создаёт таблицу прогресса видео с отрезками и позициями', () => {
    expect(sql).toContain('learning.video_progress');
    expect(sql).toContain('watched_ranges jsonb');
    expect(sql).toContain('last_position_seconds');
    expect(sql).toContain('max_position_seconds');
  });

  it('одна строка на (тенант, зачисление, материал) — heartbeat не плодит записи', () => {
    expect(sql).toContain('PRIMARY KEY (tenant_id, enrollment_id, material_id)');
  });

  it('индексирует выборку по зачислению — журнал часов (Task 8)', () => {
    expect(sql).toContain('idx_video_progress_tenant_enrollment');
  });

  it('аддитивна и обёрнута в транзакцию', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS');
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN)/i);
    expect(sql).toContain('BEGIN;');
    expect(sql).toContain('COMMIT;');
  });
});
