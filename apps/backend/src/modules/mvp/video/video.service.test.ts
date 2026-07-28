import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { InMemoryVideoAssetsRepository } from './in-memory-video-assets.repository.js';
import { InMemoryVideoProviderSettingsRepository } from './in-memory-video-provider-settings.repository.js';
import { VideoProviderResolver } from './video-provider-resolver.service.js';
import { VideoProviderSettingsService } from './video-provider-settings.service.js';
import { VIDEO_MAX_BYTES, VideoService } from './video.service.js';
import { FakeVideoProvider } from '../../../infrastructure/video-provider/fake-video.provider.js';
import {
  NoopVideoProvider,
  type VideoProvider,
  type VideoProviderCode,
  type VideoProviderRegistry
} from '../../../infrastructure/video-provider/video.provider.js';

import type { FilesService } from '../../files/files.service.js';

/** Загрузка видео методистом (ФТ-B1.1, Фаза 2 Task 2). */

const T = 'tenant_demo';
const MP4 = { fileName: 'lesson.mp4', sizeBytes: 100 * 1024 * 1024, contentType: 'video/mp4' };

function makeService() {
  const assets = new InMemoryVideoAssetsRepository();
  const settingsRepo = new InMemoryVideoProviderSettingsRepository();
  const settings = new VideoProviderSettingsService(settingsRepo);
  const registry: VideoProviderRegistry = new Map<VideoProviderCode, VideoProvider>([
    ['noop', new NoopVideoProvider()],
    ['fake', new FakeVideoProvider()]
  ]);
  const resolver = new VideoProviderResolver(registry, settings, 'test');
  const files = {
    createMultipartUploadIntent: vi.fn(async () => ({
      fileId: 'file_1',
      storageKey: 'video/tenant_demo/abc_lesson.mp4',
      uploadId: 'upload_1',
      partSizeBytes: 32 * 1024 * 1024,
      partCount: 4
    })),
    createPartUploadUrl: vi.fn(async () => ({
      uploadUrl: 'https://s3.local/PUT-part',
      expiresInSeconds: 900
    })),
    completeMultipartUpload: vi.fn(async () => undefined),
    abortMultipartUpload: vi.fn(async () => undefined)
  };
  const service = new VideoService(assets, resolver, files as unknown as FilesService);
  return { service, assets, settings, files };
}

describe('VideoService.createAsset — ветка self-hosted', () => {
  it('без настроенного провайдера отдаёт загрузку по частям', async () => {
    const { service, files } = makeService();
    const result = await service.createAsset(T, MP4);

    expect(result.uploadKind).toBe('multipart');
    expect(result.partCount).toBe(4);
    expect(result.status).toBe('uploading');
    // Файл регистрируется в storage.files — от этого зависит антивирусный гейт (ФТ-G5).
    expect(files.createMultipartUploadIntent).toHaveBeenCalledWith(
      T,
      expect.objectContaining({ originalName: 'lesson.mp4' }),
      expect.objectContaining({ keyPrefix: 'video' })
    );
  });

  it('отвергает не-видео до создания ассета', async () => {
    const { service, files } = makeService();
    await expect(
      service.createAsset(T, { ...MP4, contentType: 'application/pdf' })
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(files.createMultipartUploadIntent).not.toHaveBeenCalled();
  });

  it('отвергает файл больше 4 ГБ с понятным текстом', async () => {
    const { service } = makeService();
    await expect(
      service.createAsset(T, { ...MP4, sizeBytes: VIDEO_MAX_BYTES + 1 })
    ).rejects.toThrow(/4 ГБ/);
  });

  it('отвергает нулевой и дробный размер', async () => {
    const { service } = makeService();
    await expect(service.createAsset(T, { ...MP4, sizeBytes: 0 })).rejects.toBeInstanceOf(
      BadRequestException
    );
    await expect(service.createAsset(T, { ...MP4, sizeBytes: 1.5 })).rejects.toBeInstanceOf(
      BadRequestException
    );
  });
});

describe('VideoService.createAsset — ветка провайдера', () => {
  it('с включённым провайдером файл льётся к нему, а не к нам', async () => {
    const { service, settings, files } = makeService();
    await settings.save(T, { providerCode: 'fake', enabled: true });

    const result = await service.createAsset(T, MP4);

    expect(result.uploadKind).toBe('provider');
    expect(result.uploadUrl?.startsWith('fake-video://')).toBe(true);
    // Наш S3 в этой ветке не задействован вообще.
    expect(files.createMultipartUploadIntent).not.toHaveBeenCalled();
  });
});

describe('VideoService — части и завершение', () => {
  it('выдаёт подписанный URL части', async () => {
    const { service, files } = makeService();
    const { assetId } = await service.createAsset(T, MP4);

    const part = await service.createPartUrl(T, assetId, 2);

    expect(part.uploadUrl).toBe('https://s3.local/PUT-part');
    expect(files.createPartUploadUrl).toHaveBeenCalledWith(
      expect.objectContaining({ uploadId: 'upload_1', partNumber: 2 })
    );
  });

  it('склеивает части и переводит ассет в «обрабатывается»', async () => {
    const { service, files } = makeService();
    const { assetId } = await service.createAsset(T, MP4);

    const asset = await service.completeUpload(T, assetId, [{ partNumber: 1, etag: '"a"' }]);

    expect(asset.status).toBe('processing');
    expect(files.completeMultipartUpload).toHaveBeenCalled();
    // Загрузка закрыта — отменять больше нечего.
    expect(asset.multipartUploadId).toBeUndefined();
  });

  it('повторное завершение при обрыве ответа не ломает уже закрытую загрузку', async () => {
    const { service, files } = makeService();
    const { assetId } = await service.createAsset(T, MP4);
    await service.completeUpload(T, assetId, [{ partNumber: 1, etag: '"a"' }]);

    const again = await service.completeUpload(T, assetId, [{ partNumber: 1, etag: '"a"' }]);

    expect(again.status).toBe('processing');
    expect(files.completeMultipartUpload).toHaveBeenCalledTimes(1);
  });

  it('после завершения новые части не выдаются', async () => {
    const { service } = makeService();
    const { assetId } = await service.createAsset(T, MP4);
    await service.completeUpload(T, assetId, [{ partNumber: 1, etag: '"a"' }]);

    await expect(service.createPartUrl(T, assetId, 2)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('VideoService — привязка к уроку и удаление', () => {
  it('привязывает готовящееся видео к материалу', async () => {
    const { service } = makeService();
    const { assetId } = await service.createAsset(T, MP4);

    const asset = await service.attachToMaterial(T, assetId, 'mat_1');

    expect(asset.materialId).toBe('mat_1');
    expect((await service.listByMaterial(T, 'mat_1')).map((a) => a.id)).toEqual([assetId]);
  });

  it('битое видео к уроку не привязывается — слушатель увидел бы пустой плеер', async () => {
    const { service } = makeService();
    const { assetId } = await service.createAsset(T, MP4);
    await service.markFailed(T, assetId, 'ffmpeg не смог открыть файл');

    await expect(service.attachToMaterial(T, assetId, 'mat_1')).rejects.toThrow(/не удалась/);
  });

  it('удаление отменяет незавершённую загрузку — иначе части занимают место', async () => {
    const { service, files } = makeService();
    const { assetId } = await service.createAsset(T, MP4);

    await service.deleteAsset(T, assetId);

    expect(files.abortMultipartUpload).toHaveBeenCalledWith(
      expect.objectContaining({ uploadId: 'upload_1' })
    );
    await expect(service.getAsset(T, assetId)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('уже вычищенная хранилищем загрузка не мешает удалить ассет', async () => {
    const { service, files } = makeService();
    const { assetId } = await service.createAsset(T, MP4);
    files.abortMultipartUpload.mockRejectedValueOnce(new Error('NoSuchUpload'));

    await expect(service.deleteAsset(T, assetId)).resolves.toBeUndefined();
  });
});

describe('VideoService — изоляция тенантов', () => {
  it('чужой ассет не находится даже по точному id', async () => {
    const { service } = makeService();
    const { assetId } = await service.createAsset(T, MP4);

    await expect(service.getAsset('tenant_other', assetId)).rejects.toBeInstanceOf(
      NotFoundException
    );
    await expect(service.createPartUrl('tenant_other', assetId, 1)).rejects.toBeInstanceOf(
      NotFoundException
    );
    await expect(service.deleteAsset('tenant_other', assetId)).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it('список по материалу не показывает видео чужого тенанта', async () => {
    const { service } = makeService();
    const { assetId } = await service.createAsset(T, MP4);
    await service.attachToMaterial(T, assetId, 'mat_1');

    expect(await service.listByMaterial('tenant_other', 'mat_1')).toEqual([]);
  });
});
