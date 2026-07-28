import { NotFoundException, PreconditionFailedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { InMemoryVideoAssetsRepository } from './in-memory-video-assets.repository.js';
import { InMemoryVideoProviderSettingsRepository } from './in-memory-video-provider-settings.repository.js';
import { PLAYBACK_URL_TTL_SECONDS, VideoPlaybackService } from './video-playback.service.js';
import { VideoProviderResolver } from './video-provider-resolver.service.js';
import { VideoProviderSettingsService } from './video-provider-settings.service.js';
import { FakeVideoProvider } from '../../../infrastructure/video-provider/fake-video.provider.js';
import {
  NoopVideoProvider,
  type VideoProvider,
  type VideoProviderCode,
  type VideoProviderRegistry
} from '../../../infrastructure/video-provider/video.provider.js';

import type { RequestContext } from '../../../common/context/request-context.js';
import type { S3StorageClient } from '../../../infrastructure/storage/s3-storage.client.js';
import type { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';
import type { MvpService } from '../mvp.service.js';

/**
 * Защищённое воспроизведение (ФТ-B2.1, Фаза 2 Task 4).
 * Смысл задачи — не «показать видео», а не показать его тем, кому нельзя.
 */

const T = 'tenant_demo';
const CTX = { tenantId: T, userId: 'u1', permissions: [] } as unknown as RequestContext;

/** Полная валидная цепочка: материал → модуль → версия курса → зачисление → связь группы. */
function makeState(overrides: Partial<Record<string, unknown[]>> = {}) {
  return {
    materials: overrides.materials ?? [
      { tenantId: T, id: 'mat_1', moduleId: 'mod_1', materialType: 'video' }
    ],
    modules: overrides.modules ?? [{ tenantId: T, id: 'mod_1', courseVersionId: 'cv_1' }],
    courseVersions: overrides.courseVersions ?? [
      { tenantId: T, id: 'cv_1', courseId: 'course_1' }
    ],
    enrollments: overrides.enrollments ?? [
      { tenantId: T, id: 'enr_1', groupId: 'grp_1', learnerId: 'lrn_1' }
    ],
    groupCourses: overrides.groupCourses ?? [
      { tenantId: T, groupId: 'grp_1', courseId: 'course_1' }
    ]
  } as unknown as InMemoryMvpState;
}

async function makeService(
  options: {
    state?: InMemoryMvpState;
    assetStatus?: 'uploading' | 'processing' | 'ready' | 'failed';
    provider?: boolean;
    noAsset?: boolean;
    assertThrows?: Error;
  } = {}
) {
  const assets = new InMemoryVideoAssetsRepository();
  if (!options.noAsset) {
    await assets.create({
      id: 'vasset_1',
      tenantId: T,
      providerCode: options.provider ? 'fake' : 'noop',
      status: options.assetStatus ?? 'ready',
      sizeBytes: 1000,
      ...(options.provider
        ? { providerAssetId: 'fake-video:vasset_1' }
        : { storageKey: 'video/t/lesson.mp4' })
    });
    await assets.update(T, 'vasset_1', { materialId: 'mat_1' });
  }

  const settingsRepo = new InMemoryVideoProviderSettingsRepository();
  const settings = new VideoProviderSettingsService(settingsRepo);
  if (options.provider) await settings.save(T, { providerCode: 'fake', enabled: true });
  const registry: VideoProviderRegistry = new Map<VideoProviderCode, VideoProvider>([
    ['noop', new NoopVideoProvider()],
    ['fake', new FakeVideoProvider()]
  ]);
  const resolver = new VideoProviderResolver(registry, settings, 'test');

  const mvp = {
    assertActorMatchesLearnerIamLink: vi.fn(() => {
      if (options.assertThrows) throw options.assertThrows;
    })
  } as unknown as MvpService;

  const storage = {
    createPresignedDownloadUrl: vi.fn(async () => 'https://s3.local/GET-video?sig=1')
  } as unknown as S3StorageClient;

  const service = new VideoPlaybackService(
    options.state ?? makeState(),
    mvp,
    assets,
    resolver,
    storage
  );
  return { service, mvp, storage, assets };
}

describe('VideoPlaybackService — кто имеет право смотреть', () => {
  it('слушатель со своим зачислением получает ссылку', async () => {
    const { service, storage } = await makeService();

    const result = await service.getPlayback(T, 'u1', 'mat_1', 'enr_1', CTX);

    expect(result.url).toContain('https://s3.local/GET-video');
    expect(result.kind).toBe('progressive');
    // Ссылка обязана быть короткоживущей: утёкшая копия должна протухнуть за минуты.
    expect(result.expiresInSeconds).toBe(PLAYBACK_URL_TTL_SECONDS);
    expect(PLAYBACK_URL_TTL_SECONDS).toBeLessThanOrEqual(600);
    expect(storage.createPresignedDownloadUrl).toHaveBeenCalledWith(
      expect.objectContaining({ expiresInSeconds: PLAYBACK_URL_TTL_SECONDS })
    );
  });

  it('чужой пользователь ссылку не получает', async () => {
    const forbidden = new Error('actor is not the learner');
    const { service } = await makeService({ assertThrows: forbidden });

    await expect(service.getPlayback(T, 'u_other', 'mat_1', 'enr_1', CTX)).rejects.toBe(forbidden);
  });

  it('зачисление на другой курс не даёт доступа к уроку', async () => {
    // Группа зачисления не связана с курсом этого материала.
    const { service } = await makeService({
      state: makeState({ groupCourses: [{ tenantId: T, groupId: 'grp_1', courseId: 'other' }] })
    });

    await expect(service.getPlayback(T, 'u1', 'mat_1', 'enr_1', CTX)).rejects.toBeInstanceOf(
      PreconditionFailedException
    );
  });

  it('несуществующее зачисление — 404, а не ссылка', async () => {
    const { service } = await makeService();
    await expect(service.getPlayback(T, 'u1', 'mat_1', 'enr_missing', CTX)).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it('материал не-видео не отдаёт видеоссылку', async () => {
    const { service } = await makeService({
      state: makeState({
        materials: [{ tenantId: T, id: 'mat_1', moduleId: 'mod_1', materialType: 'text' }]
      })
    });

    await expect(service.getPlayback(T, 'u1', 'mat_1', 'enr_1', CTX)).rejects.toBeInstanceOf(
      PreconditionFailedException
    );
  });

  it('чужой тенант не достаёт материал даже по точному id', async () => {
    const { service } = await makeService();
    await expect(
      service.getPlayback('tenant_other', 'u1', 'mat_1', 'enr_1', CTX)
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('доступ проверяется ДО выдачи ссылки — хранилище не дёргается при отказе', async () => {
    const { service, storage } = await makeService({ assertThrows: new Error('нет прав') });

    await expect(service.getPlayback(T, 'u1', 'mat_1', 'enr_1', CTX)).rejects.toThrow();
    expect(storage.createPresignedDownloadUrl).not.toHaveBeenCalled();
  });
});

describe('VideoPlaybackService — состояние видео', () => {
  it('без привязанного видео — понятный 404', async () => {
    const { service } = await makeService({ noAsset: true });
    await expect(service.getPlayback(T, 'u1', 'mat_1', 'enr_1', CTX)).rejects.toThrow(
      /не привязано видео/
    );
  });

  it('необработанное видео — «откройте позже», а не битая ссылка', async () => {
    const { service } = await makeService({ assetStatus: 'processing' });
    await expect(service.getPlayback(T, 'u1', 'mat_1', 'enr_1', CTX)).rejects.toThrow(
      /обрабатывается/
    );
  });

  it('упавшее видео показывает причину, а не молчит', async () => {
    const { service, assets } = await makeService({ assetStatus: 'failed' });
    await assets.update(T, 'vasset_1', { errorMessage: 'ffmpeg не смог открыть файл' });

    await expect(service.getPlayback(T, 'u1', 'mat_1', 'enr_1', CTX)).rejects.toThrow(/ffmpeg/);
  });
});

describe('VideoPlaybackService — ветка провайдера', () => {
  it('ссылку выдаёт сам провайдер, наше хранилище не участвует', async () => {
    const { service, storage } = await makeService({ provider: true });

    const result = await service.getPlayback(T, 'u1', 'mat_1', 'enr_1', CTX);

    expect(result.kind).toBe('hls');
    expect(result.url).toContain('fake-video://');
    expect(storage.createPresignedDownloadUrl).not.toHaveBeenCalled();
  });

  it('видео у провайдера, а провайдер выключен — понятный отказ, а не пустая ссылка', async () => {
    // Ассет лежит у провайдера, но в настройках тенанта тот выключен: резолвер отдаёт
    // noop, он честно возвращает null — значит показать нечего.
    const { service } = await makeService({ provider: true });
    const settingsRepo = new InMemoryVideoProviderSettingsRepository();
    const settings = new VideoProviderSettingsService(settingsRepo);
    await settings.save(T, { providerCode: 'fake', enabled: false });
    const sleeping = new VideoProviderResolver(
      new Map<VideoProviderCode, VideoProvider>([['noop', new NoopVideoProvider()]]),
      settings,
      'test'
    );
    (service as unknown as { providers: VideoProviderResolver }).providers = sleeping;

    await expect(service.getPlayback(T, 'u1', 'mat_1', 'enr_1', CTX)).rejects.toThrow(
      /недоступен/
    );
  });
});
