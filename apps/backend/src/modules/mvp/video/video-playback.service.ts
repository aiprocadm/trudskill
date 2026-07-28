import { Inject, Injectable, NotFoundException, PreconditionFailedException } from '@nestjs/common';

import { VideoAccessService } from './video-access.service.js';
import {
  VIDEO_ASSETS_REPOSITORY,
  type VideoAssetRow,
  type VideoAssetsRepository
} from './video-assets.repository.js';
import {
  VIDEO_PROGRESS_REPOSITORY,
  type VideoProgressRepository
} from './video-progress.repository.js';
import { VideoProviderResolver } from './video-provider-resolver.service.js';
import { S3StorageClient } from '../../../infrastructure/storage/s3-storage.client.js';

import type { RequestContext } from '../../../common/context/request-context.js';

/**
 * Защищённое воспроизведение видео (ФТ-B2.1, Фаза 2 Task 4).
 *
 * Два инварианта, ради которых эта задача вообще существует:
 *
 * 1. **Ссылку получает только слушатель с активным зачислением** на курс, где лежит
 *    материал. Проверка — та же цепочка, что у запуска SCORM: материал → модуль → версия
 *    курса → зачисление → связь группы с курсом → совпадение actor'а со слушателем.
 *    Без неё ссылку на платное видео мог бы получить любой пользователь тенанта.
 * 2. **Ссылка короткоживущая.** Она всё равно утечёт (пользователь может её скопировать),
 *    поэтому важно не «запретить копирование» — это невозможно, — а сделать копию
 *    бесполезной через несколько минут. Плеер сам берёт новую до истечения.
 *
 * Скачивание технически не запрещается: любой браузер умеет сохранять то, что показывает.
 * Настоящая защита от перепродажи записи — водяной знак с данными слушателя (ФТ-B2.2,
 * Task 5), а не попытки спрятать URL.
 */

/** Ровно 10 минут — верхняя граница из плана фазы. Короче нет смысла: плеер начнёт дёргаться. */
export const PLAYBACK_URL_TTL_SECONDS = 600;

export interface PlaybackResult {
  url: string;
  kind: 'hls' | 'progressive';
  expiresInSeconds: number;
  /** Длительность известна после обработки; плееру она нужна для расчёта прогресса (ФТ-B3.1). */
  durationSeconds?: number;
  /** ФТ-B3.3: откуда продолжить — плеер стартует с этой секунды. */
  lastPositionSeconds: number;
}

@Injectable()
export class VideoPlaybackService {
  constructor(
    @Inject(VideoAccessService) private readonly access: VideoAccessService,
    @Inject(VIDEO_ASSETS_REPOSITORY) private readonly assets: VideoAssetsRepository,
    @Inject(VideoProviderResolver) private readonly providers: VideoProviderResolver,
    @Inject(S3StorageClient) private readonly storage: S3StorageClient,
    @Inject(VIDEO_PROGRESS_REPOSITORY) private readonly progress: VideoProgressRepository
  ) {}

  async getPlayback(
    tenantId: string,
    actorId: string | undefined,
    materialId: string,
    enrollmentId: string,
    ctx: RequestContext
  ): Promise<PlaybackResult> {
    this.access.assertLearnerMayWatch(tenantId, actorId, materialId, enrollmentId, ctx);

    const asset = await this.readyAssetFor(tenantId, materialId);

    // Ветка провайдера: ссылку выдаёт он сам (свой CDN и свои подписи).
    if (asset.providerAssetId) {
      const provider = await this.providers.forTenant(tenantId);
      const source = await provider.getPlayback({
        tenantId,
        providerAssetId: asset.providerAssetId
      });
      if (!source) {
        throw new PreconditionFailedException({
          code: 'playback_unavailable',
          message: 'Видеосервис сейчас недоступен — попробуйте позже'
        });
      }
      return {
        ...source,
        lastPositionSeconds: await this.resumePosition(tenantId, enrollmentId, materialId),
        ...(asset.durationSeconds ? { durationSeconds: asset.durationSeconds } : {})
      };
    }

    if (!asset.storageKey) {
      throw new PreconditionFailedException({
        code: 'playback_unavailable',
        message: 'У этого видео нет файла для воспроизведения'
      });
    }

    // Self-hosted: пока нет транскодирования (Task 10) отдаём оригинал одним файлом.
    // `kind` честно говорит плееру, что это не HLS, — он не станет искать манифест.
    const url = await this.storage.createPresignedDownloadUrl({
      key: asset.storageKey,
      expiresInSeconds: PLAYBACK_URL_TTL_SECONDS
    });
    return {
      url,
      kind: 'progressive',
      expiresInSeconds: PLAYBACK_URL_TTL_SECONDS,
      lastPositionSeconds: await this.resumePosition(tenantId, enrollmentId, materialId),
      ...(asset.durationSeconds ? { durationSeconds: asset.durationSeconds } : {})
    };
  }

  /** ФТ-B3.3: закрытая вкладка не должна стоить слушателю просмотренных минут. */
  private async resumePosition(
    tenantId: string,
    enrollmentId: string,
    materialId: string
  ): Promise<number> {
    const stored = await this.progress.find(tenantId, enrollmentId, materialId);
    return stored?.lastPositionSeconds ?? 0;
  }

  /** Готовое к показу видео этого материала; несколько — берём самое свежее. */
  private async readyAssetFor(tenantId: string, materialId: string): Promise<VideoAssetRow> {
    const assets = await this.assets.listByMaterial(tenantId, materialId);
    if (!assets.length) {
      throw new NotFoundException({ code: 'not_found', message: 'К уроку не привязано видео' });
    }
    const ready = assets.find((item) => item.status === 'ready');
    if (!ready) {
      const worst = assets[0]!;
      throw new PreconditionFailedException({
        code: 'video_not_ready',
        message:
          worst.status === 'failed'
            ? `Видео не удалось обработать: ${worst.errorMessage ?? 'причина неизвестна'}`
            : 'Видео ещё обрабатывается — откройте урок чуть позже'
      });
    }
    return ready;
  }
}
