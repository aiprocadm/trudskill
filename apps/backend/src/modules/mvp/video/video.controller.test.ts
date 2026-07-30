import { describe, expect, it, vi } from 'vitest';

import { VideoController } from './video.controller.js';

import type { VideoService } from './video.service.js';
import type { RequestContext } from '../../../common/context/request-context.js';

/**
 * Видео-контроллер (покрытие 0% → полное): валидация тел запросов через
 * `assertValidDto` и делегирование под тенантом актора. Общий прототип-обход,
 * как у esign, здесь не годится — мусорное тело обязано отбиваться ДО сервиса.
 */
const ctx = {
  tenantId: 'tenant_demo',
  userId: 'u_1',
  requestId: 'r1',
  correlationId: 'c1'
} as RequestContext;

function harness() {
  const service = {
    createAsset: vi.fn().mockResolvedValue({ id: 'va_1' }),
    createPartUrl: vi.fn().mockResolvedValue({ url: 'u' }),
    completeUpload: vi.fn().mockResolvedValue({ id: 'va_1' }),
    attachToMaterial: vi.fn().mockResolvedValue({ id: 'va_1' }),
    markFailed: vi.fn().mockResolvedValue({ id: 'va_1' }),
    listByMaterial: vi.fn().mockResolvedValue([{ id: 'va_1' }]),
    getStorageUsage: vi.fn().mockResolvedValue({ usedBytes: 1 }),
    getAsset: vi.fn().mockResolvedValue({ id: 'va_1' }),
    deleteAsset: vi.fn().mockResolvedValue(undefined)
  };
  return { controller: new VideoController(service as unknown as VideoService), service };
}

describe('VideoController — валидация и делегирование', () => {
  it('create: валидное тело уходит в сервис под тенантом актора', () => {
    const h = harness();
    h.controller.create(ctx, { fileName: 'a.mp4', sizeBytes: 100, contentType: 'video/mp4' });
    expect(h.service.createAsset).toHaveBeenCalledWith(
      'tenant_demo',
      expect.objectContaining({ fileName: 'a.mp4' })
    );
  });

  it('create: мусорное тело отбивается ДО сервиса', () => {
    const h = harness();
    // Отрицательный размер файла — классический вредный ввод.
    expect(() => h.controller.create(ctx, { fileName: '', sizeBytes: -5 })).toThrow();
    expect(h.service.createAsset).not.toHaveBeenCalled();
  });

  it('partUrl: номер части строго положительный', () => {
    const h = harness();
    h.controller.partUrl(ctx, 'va_1', { partNumber: 3 });
    expect(h.service.createPartUrl).toHaveBeenCalledWith('tenant_demo', 'va_1', 3);
    expect(() => h.controller.partUrl(ctx, 'va_1', { partNumber: 0 })).toThrow();
  });

  it('complete: parts опциональны — пусто превращается в []', () => {
    const h = harness();
    h.controller.complete(ctx, 'va_1', {});
    expect(h.service.completeUpload).toHaveBeenCalledWith('tenant_demo', 'va_1', []);
    // Вложенная валидация: часть без etag отбивается.
    expect(() =>
      h.controller.complete(ctx, 'va_1', { parts: [{ partNumber: 1, etag: '' }] })
    ).toThrow();
  });

  it('attach / fail: валидные тела делегируются, пустые отбиваются', () => {
    const h = harness();
    h.controller.attach(ctx, 'va_1', { materialId: 'm1' });
    expect(h.service.attachToMaterial).toHaveBeenCalledWith('tenant_demo', 'va_1', 'm1');
    h.controller.fail(ctx, 'va_1', { message: 'кодек не поддержан' });
    expect(h.service.markFailed).toHaveBeenCalledWith('tenant_demo', 'va_1', 'кодек не поддержан');
    expect(() => h.controller.attach(ctx, 'va_1', { materialId: '' })).toThrow();
    expect(() => h.controller.fail(ctx, 'va_1', {})).toThrow();
  });

  it('list: без materialId — пустой список БЕЗ похода в сервис', async () => {
    const h = harness();
    const out = await h.controller.list(ctx, undefined);
    expect(out).toEqual({ items: [] });
    expect(h.service.listByMaterial).not.toHaveBeenCalled();

    const withId = await h.controller.list(ctx, 'm1');
    expect(withId).toEqual({ items: [{ id: 'va_1' }], total: 1 });
  });

  it('storage / get / remove: делегирование под тенантом', async () => {
    const h = harness();
    h.controller.storage(ctx);
    expect(h.service.getStorageUsage).toHaveBeenCalledWith('tenant_demo');
    h.controller.get(ctx, 'va_1');
    expect(h.service.getAsset).toHaveBeenCalledWith('tenant_demo', 'va_1');
    await expect(h.controller.remove(ctx, 'va_1')).resolves.toEqual({ deleted: true });
    expect(h.service.deleteAsset).toHaveBeenCalledWith('tenant_demo', 'va_1');
  });
});
