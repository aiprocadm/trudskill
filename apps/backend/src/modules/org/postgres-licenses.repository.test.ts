import { describe, expect, it } from 'vitest';

import { PostgresLicensesRepository } from './postgres-licenses.repository.js';

import type { TrainingLicense } from './licenses.types.js';
import type { DatabaseService } from '../../infrastructure/database/database.service.js';

/**
 * Маппинг `org.training_licenses` (покрытие 0% → полное): перевод колонок, отсев
 * null и ПУСТЫХ массивов, каст дат к тексту в SELECT (иначе node-pg отдал бы Date и
 * сломал строковое сравнение сроков).
 */
type Call = { sql: string; params: unknown[] };
function fakeDb(rows: unknown[] = []) {
  const calls: Call[] = [];
  const db = {
    query: async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params });
      return rows;
    }
  } as unknown as DatabaseService;
  return { db, calls };
}

const row = {
  id: 'lic_1',
  tenant_id: 't1',
  license_type: 'education',
  license_number: 'Л035-001',
  issuer_name: 'Рособрнадзор',
  issued_at: '2024-01-10',
  valid_until: null,
  scan_file_id: null,
  permitted_training_types: [] as string[],
  permitted_directions: ['OT'],
  status: 'active',
  notes: null,
  created_at: 'c',
  updated_at: 'u'
};

const license: TrainingLicense = {
  id: 'lic_1',
  tenantId: 't1',
  licenseType: 'education',
  licenseNumber: 'Л035-001',
  issuerName: 'Рособрнадзор',
  issuedAt: '2024-01-10',
  status: 'active',
  createdAt: 'c',
  updatedAt: 'u'
};

describe('PostgresLicensesRepository — маппинг и параметры', () => {
  it('map: null и ПУСТОЙ массив не попадают в сущность, непустой — попадает', async () => {
    const { db } = fakeDb([row]);
    const [lic] = await new PostgresLicensesRepository(db).list('t1');

    expect(lic).toMatchObject({ licenseNumber: 'Л035-001', permittedDirections: ['OT'] });
    // Пустой массив разрешённых видов — то же, что «не ограничено»: поля нет.
    expect(lic).not.toHaveProperty('permittedTrainingTypes');
    expect(lic).not.toHaveProperty('validUntil');
    expect(lic).not.toHaveProperty('notes');
  });

  it('list: статус добавляет условие, без него — только tenant', async () => {
    const { db, calls } = fakeDb([]);
    const repo = new PostgresLicensesRepository(db);
    await repo.list('t1');
    await repo.list('t1', 'active');

    expect(calls[0]!.sql).not.toContain('status = $2');
    expect(calls[1]!.sql).toContain('status = $2');
    expect(calls[1]!.params).toEqual(['t1', 'active']);
  });

  it('SELECT кастует даты к тексту — иначе node-pg отдаст Date и сломает сравнение', async () => {
    const { db, calls } = fakeDb([]);
    await new PostgresLicensesRepository(db).getById('t1', 'lic_1');
    expect(calls[0]!.sql).toContain('issued_at::text');
    expect(calls[0]!.sql).toContain('valid_until::text');
  });

  it('getById / findByTypeAndNumber: пусто → null', async () => {
    const { db } = fakeDb([]);
    const repo = new PostgresLicensesRepository(db);
    await expect(repo.getById('t1', 'x')).resolves.toBeNull();
    await expect(repo.findByTypeAndNumber('t1', 'education', 'N')).resolves.toBeNull();
  });

  it('insert: необязательные поля уходят в БД как null, а не undefined', async () => {
    const { db, calls } = fakeDb([row]);
    await new PostgresLicensesRepository(db).insert(license);

    const params = calls[0]!.params;
    expect(params[6]).toBeNull(); // valid_until
    expect(params[7]).toBeNull(); // scan_file_id
    expect(params[11]).toBeNull(); // notes
  });

  it('update: where по паре tenant_id + id', async () => {
    const { db, calls } = fakeDb([row]);
    await new PostgresLicensesRepository(db).update(license);
    expect(calls[0]!.sql).toContain('where tenant_id = $1 and id = $2');
    expect(calls[0]!.params.slice(0, 2)).toEqual(['t1', 'lic_1']);
  });

  it('findActiveExpiringBefore: только active с непустым сроком', async () => {
    const { db, calls } = fakeDb([row]);
    await new PostgresLicensesRepository(db).findActiveExpiringBefore('t1', '2026-12-31');
    expect(calls[0]!.sql).toContain("status = 'active'");
    expect(calls[0]!.sql).toContain('valid_until is not null');
    expect(calls[0]!.params).toEqual(['t1', '2026-12-31']);
  });
});
