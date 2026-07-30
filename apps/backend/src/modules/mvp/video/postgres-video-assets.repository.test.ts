import { describe, expect, it } from 'vitest';

import { PostgresVideoAssetsRepository } from './postgres-video-assets.repository.js';

import type { DatabaseService } from '../../../infrastructure/database/database.service.js';

/**
 * Маппинг `learning.video_assets` (покрытие 0% → полное). Главные ловушки:
 * bigint-размер приезжает строкой (без Number() арифметика лимита хранилища поехала бы)
 * и семантика patch — «undefined = не менять, null = стереть», где coalesce не годится.
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
  id: 'va_1',
  tenant_id: 't1',
  material_id: null,
  provider_code: 'selfhosted',
  provider_asset_id: null,
  status: 'processing',
  duration_seconds: 0,
  size_bytes: '1073741824', // 1 ГБ как bigint-строка
  storage_key: 'videos/t1/va_1.mp4',
  error_message: null,
  file_id: 'f1',
  multipart_upload_id: null,
  created_at: 'c',
  updated_at: 'u'
};

describe('PostgresVideoAssetsRepository — маппинг и параметры', () => {
  it('bigint-размер становится числом; НУЛЕВАЯ длительность не теряется', async () => {
    // duration_seconds === 0 — валидное значение (обработка началась), проверка
    // строго на null, а не на falsy: иначе ноль исчез бы из сущности.
    const { db } = fakeDb([row]);
    const asset = await new PostgresVideoAssetsRepository(db).findById('t1', 'va_1');

    expect(asset!.sizeBytes).toBe(1073741824);
    expect(typeof asset!.sizeBytes).toBe('number');
    expect(asset!.durationSeconds).toBe(0);
    expect(asset).not.toHaveProperty('materialId');
    expect(asset).not.toHaveProperty('errorMessage');
  });

  it('findById: чужой ассет не находится даже по точному id — tenant_id в where', async () => {
    const { db, calls } = fakeDb([]);
    await new PostgresVideoAssetsRepository(db).findById('t1', 'va_x');
    expect(calls[0]!.sql).toContain('tenant_id = $1 and id = $2');
    expect(calls[0]!.params).toEqual(['t1', 'va_x']);
  });

  it('findByProviderAssetId: вебхук ищет без тенанта — провайдер их не знает', async () => {
    const { db, calls } = fakeDb([row]);
    await new PostgresVideoAssetsRepository(db).findByProviderAssetId('ext_1');
    expect(calls[0]!.sql).toContain('where provider_asset_id = $1');
    expect(calls[0]!.params).toEqual(['ext_1']);
  });

  it('create: необязательные поля уходят как null', async () => {
    const { db, calls } = fakeDb([row]);
    await new PostgresVideoAssetsRepository(db).create({
      id: 'va_1',
      tenantId: 't1',
      providerCode: 'selfhosted',
      status: 'uploading',
      sizeBytes: 100
    } as never);
    const p = calls[0]!.params;
    expect(p[3]).toBeNull(); // provider_asset_id
    expect(p[6]).toBeNull(); // storage_key
  });

  it('update: undefined = «не менять» (флаг false), null = «стереть» (флаг true)', async () => {
    const { db, calls } = fakeDb([row]);
    await new PostgresVideoAssetsRepository(db).update('t1', 'va_1', {
      status: 'ready',
      multipartUploadId: null
    } as never);

    const p = calls[0]!.params;
    expect(p[2]).toBe(true); // status пришёл
    expect(p[3]).toBe('ready');
    expect(p[4]).toBe(false); // durationSeconds не трогаем
    expect(p[10]).toBe(true); // multipartUploadId пришёл...
    expect(p[11]).toBeNull(); // ...и означает «стереть»
  });

  it('update несуществующего → null; delete возвращает факт удаления', async () => {
    const { db } = fakeDb([]);
    const repo = new PostgresVideoAssetsRepository(db);
    await expect(repo.update('t1', 'nope', {} as never)).resolves.toBeNull();
    await expect(repo.delete('t1', 'nope')).resolves.toBe(false);

    const { db: withRow } = fakeDb([{ id: 'va_1' }]);
    await expect(new PostgresVideoAssetsRepository(withRow).delete('t1', 'va_1')).resolves.toBe(
      true
    );
  });

  it('listByMaterial: свежие первыми, скоуп по тенанту и материалу', async () => {
    const { db, calls } = fakeDb([row]);
    const items = await new PostgresVideoAssetsRepository(db).listByMaterial('t1', 'm1');
    expect(items).toHaveLength(1);
    expect(calls[0]!.sql).toContain('order by created_at desc');
    expect(calls[0]!.params).toEqual(['t1', 'm1']);
  });
});
