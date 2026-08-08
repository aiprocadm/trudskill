import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(__dirname, '../../../migrations/0080_ops_job_quarantine.sql'),
  'utf8'
);

/**
 * Карантин упавших задач (ФТ-I1, Фаза 6 Task 7).
 *
 * Свойства таблицы, каждое из которых куплено конкретной бедой:
 *  - `tenant_id` без внешнего ключа и NULLABLE: в карантин попадает в том числе мусор
 *    с несуществующим тенантом, и именно его нельзя терять;
 *  - уникальность по `message_id`: повторное падение того же сообщения обновляет строку,
 *    иначе список превращается в ленту дублей;
 *  - права выдаются только администрации: решать, переотправлять ли выпуск документа, —
 *    не работа методиста.
 */
describe('миграция 0080 — карантин задач', () => {
  it('создаёт таблицу карантина', () => {
    expect(sql).toContain('documents.job_quarantine');
    expect(sql.toLowerCase()).toContain('create table if not exists');
  });

  it('хранит тело сообщения как есть — его же публикуют обратно', () => {
    expect(sql).toContain('raw_body text NOT NULL');
  });

  it('tenant_id не обязателен и без внешнего ключа: мусор тоже должен сохраняться', () => {
    expect(sql).toMatch(/tenant_id text NULL/);
    expect(sql).not.toMatch(/tenant_id[^\n]*REFERENCES/i);
  });

  it('повторное падение того же сообщения не плодит строки', () => {
    expect(sql.toLowerCase()).toContain('create unique index if not exists');
    expect(sql).toContain('uq_job_quarantine_message');
    expect(sql).toContain('WHERE message_id IS NOT NULL');
  });

  it('статусы ограничены проверкой — «разобранное» нельзя перепутать с «ждёт»', () => {
    expect(sql).toContain("CHECK (status IN ('quarantined', 'republished', 'discarded'))");
  });

  it('заводит права и выдаёт их только администрации', () => {
    expect(sql).toContain('operations.quarantine.read');
    expect(sql).toContain('operations.quarantine.write');
    expect(sql).toContain("r.code IN ('platform_admin', 'tenant_admin')");
  });

  it('аддитивна и идемпотентна — прогон дважды ничего не ломает', () => {
    expect(sql).toContain('ON CONFLICT (id) DO NOTHING');
    expect(sql).toContain('ON CONFLICT (tenant_id, role_id, permission_id) DO NOTHING');
    expect(sql).not.toMatch(/\bDROP\s+(TABLE|COLUMN)\b/i);
  });
});
