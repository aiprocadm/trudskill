import { describe, expect, it, vi } from 'vitest';

import {
  STORAGE_LIMIT_SETTINGS_KEY,
  StorageLimitExceededError,
  TenantStorageService,
  formatBytes
} from './tenant-storage.service.js';

import type { DatabaseService } from '../../../infrastructure/database/database.service.js';
import type { TenantService } from '../../tenant/tenant.service.js';

/** Учёт занятого места per tenant (ФТ-B1.3, Фаза 2 Task 3). */

const T = 'tenant_demo';
const GB = 1024 ** 3;

function makeService(options: { used?: number; limit?: unknown; noSettings?: boolean } = {}) {
  const query = vi.fn(async () => [{ used: String(options.used ?? 0) }]);
  const db = { query } as unknown as DatabaseService;
  const getSettings = vi.fn(async () => {
    if (options.noSettings) throw new Error('tenant_settings_not_found');
    return {
      tenantId: T,
      locale: 'ru',
      timezone: 'Europe/Moscow',
      payload: options.limit === undefined ? {} : { [STORAGE_LIMIT_SETTINGS_KEY]: options.limit }
    };
  });
  const tenants = { getSettings } as unknown as TenantService;
  return { service: new TenantStorageService(db, tenants), query, getSettings };
}

describe('TenantStorageService.getUsage', () => {
  it('без лимита в настройках отдаёт безлимит, а не ноль', async () => {
    const { service } = makeService({ used: 5 * GB });
    expect(await service.getUsage(T)).toEqual({
      usedBytes: 5 * GB,
      limitBytes: null,
      remainingBytes: null
    });
  });

  it('тенант вообще без настроек не роняет счётчик', async () => {
    const { service } = makeService({ used: GB, noSettings: true });
    expect((await service.getUsage(T)).limitBytes).toBeNull();
  });

  it('считает остаток при заданном лимите', async () => {
    const { service } = makeService({ used: 3 * GB, limit: 10 * GB });
    expect(await service.getUsage(T)).toEqual({
      usedBytes: 3 * GB,
      limitBytes: 10 * GB,
      remainingBytes: 7 * GB
    });
  });

  it('перерасход даёт нулевой остаток, а не отрицательный', async () => {
    const { service } = makeService({ used: 12 * GB, limit: 10 * GB });
    expect((await service.getUsage(T)).remainingBytes).toBe(0);
  });

  it('мусор в настройках лимита трактуется как безлимит', async () => {
    for (const bad of ['10гб', 0, -5, null, {}]) {
      const { service } = makeService({ limit: bad });
      expect((await service.getUsage(T)).limitBytes).toBeNull();
    }
  });

  it('запрос не считает self-hosted видео дважды и игнорирует failed', async () => {
    const { service, query } = makeService({ used: GB });
    await service.getUsage(T);

    const sql = String(query.mock.calls[0]![0]);
    // Файл, на который ссылается ассет, исключается из суммы storage.files.
    expect(sql).toContain('not exists');
    expect(sql).toContain('v.file_id = f.id');
    // Битые ассеты места не занимают.
    expect(sql).toContain("status in ('uploading', 'processing', 'ready')");
    // Удалённые файлы тоже не считаются.
    expect(sql).toContain('deleted_at is null');
    // Тенант — единственный параметр: чужое место не подмешивается.
    expect(query.mock.calls[0]![1]).toEqual([T]);
  });
});

describe('TenantStorageService.assertFits', () => {
  it('безлимитный тенант проходит любой размер', async () => {
    const { service } = makeService({ used: 100 * GB });
    await expect(service.assertFits(T, 4 * GB)).resolves.toMatchObject({ limitBytes: null });
  });

  it('файл, влезающий в остаток, проходит', async () => {
    const { service } = makeService({ used: 5 * GB, limit: 10 * GB });
    await expect(service.assertFits(T, 4 * GB)).resolves.toMatchObject({ usedBytes: 5 * GB });
  });

  it('файл сверх лимита отвергается с понятным текстом', async () => {
    const { service } = makeService({ used: 0, limit: GB });
    await expect(service.assertFits(T, 2 * GB)).rejects.toBeInstanceOf(StorageLimitExceededError);
    await expect(service.assertFits(T, 2 * GB)).rejects.toThrow(/занято .* из .*ГБ/);
  });

  it('ровно по границе — проходит, на байт больше — нет', async () => {
    const { service } = makeService({ used: 0, limit: GB });
    await expect(service.assertFits(T, GB)).resolves.toBeTruthy();
    await expect(service.assertFits(T, GB + 1)).rejects.toBeInstanceOf(StorageLimitExceededError);
  });
});

describe('formatBytes', () => {
  it('показывает гигабайты, мегабайты и килобайты — не голые числа', () => {
    expect(formatBytes(2.5 * GB)).toBe('2.5 ГБ');
    expect(formatBytes(700 * 1024 ** 2)).toBe('700 МБ');
    expect(formatBytes(5 * 1024)).toBe('5 КБ');
    // Совсем мелкий файл не должен показываться как «0 КБ».
    expect(formatBytes(10)).toBe('1 КБ');
  });
});
