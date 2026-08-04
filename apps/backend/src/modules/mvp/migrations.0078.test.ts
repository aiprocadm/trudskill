import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const sql = readFileSync(
  join(__dirname, '../../../migrations/0078_core_platform_library_courses.sql'),
  'utf8'
);

const ddl = sql
  .split('\n')
  .filter((line) => !line.trimStart().startsWith('--'))
  .join('\n');

/** Фаза 4 Task 10 (ФТ-D6): библиотека курсов платформы. */
describe('migration 0078', () => {
  it('каталог хранит СНИМОК содержимого, а не ссылку на курс тенанта', () => {
    expect(ddl).toContain('CREATE TABLE IF NOT EXISTS core.platform_library_courses');
    expect(ddl).toMatch(/content jsonb NOT NULL/);
  });

  it('источник — только история: колонка есть, но допускает NULL', () => {
    expect(ddl).toContain('source_tenant_id text NULL REFERENCES core.tenants(id)');
  });

  it('код курса в каталоге уникален', () => {
    expect(ddl).toContain('CREATE UNIQUE INDEX IF NOT EXISTS uq_platform_library_courses_code');
  });

  it('право library.publish — только платформе, не арендаторам', () => {
    const grant = ddl.slice(ddl.indexOf('INSERT INTO iam.role_permissions'));
    expect(grant).toMatch(/WHERE r\.code = 'platform_admin'/);
    expect(grant).not.toContain("'tenant_admin'");
    expect(grant).not.toContain("'methodist'");
  });

  it('идемпотентна и обёрнута в транзакцию', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS');
    expect(sql).toContain('ON CONFLICT (id) DO NOTHING');
    expect(sql).toContain('BEGIN;');
    expect(sql).toContain('COMMIT;');
  });
});
