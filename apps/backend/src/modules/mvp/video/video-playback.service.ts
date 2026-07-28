import {
  Inject,
  Injectable,
  NotFoundException,
  PreconditionFailedException
} from '@nestjs/common';

import {
  VIDEO_ASSETS_REPOSITORY,
  type VideoAssetRow,
  type VideoAssetsRepository
} from './video-assets.repository.js';
import { VideoProviderResolver } from './video-provider-resolver.service.js';
import { S3StorageClient } from '../../../infrastructure/storage/s3-storage.client.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';
import { MVP_STATE } from '../infrastructure/mvp-state.token.js';
import { MvpService } from '../mvp.service.js';

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
}

@Injectable()
export class VideoPlaybackService {
  constructor(
    @Inject(MVP_STATE) private readonly state: InMemoryMvpState,
    @Inject(MvpService) private readonly mvp: MvpService,
    @Inject(VIDEO_ASSETS_REPOSITORY) private readonly assets: VideoAssetsRepository,
    @Inject(VideoProviderResolver) private readonly providers: VideoProviderResolver,
    @Inject(S3StorageClient) private readonly storage: S3StorageClient
  ) {}

  async getPlayback(
    tenantId: string,
    actorId: string | undefined,
    materialId: string,
    enrollmentId: string,
    ctx: RequestContext
  ): Promise<PlaybackResult> {
    this.assertLearnerMayWatch(tenantId, actorId, materialId, enrollmentId, ctx);

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
      ...(asset.durationSeconds ? { durationSeconds: asset.durationSeconds } : {})
    };
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

  /**
   * Та же цепочка проверок, что у запуска SCORM (`scorm.service.ts`): дублируется
   * намеренно — у видео свои сообщения об ошибках, а вытаскивать общий хелпер из
   * request-scoped сервиса значило бы тянуть за собой половину его состояния.
   */
  private assertLearnerMayWatch(
    tenantId: string,
    actorId: string | undefined,
    materialId: string,
    enrollmentId: string,
    ctx: RequestContext
  ): void {
    const material = this.state.materials.find(
      (m) => m.tenantId === tenantId && m.id === materialId
    );
    if (!material) {
      throw new NotFoundException({ code: 'not_found', message: 'Material not found' });
    }
    if (material.materialType !== 'video') {
      throw new PreconditionFailedException({
        code: 'domain_rule_violation',
        message: 'Этот материал — не видео'
      });
    }
    const moduleEntity = this.state.modules.find(
      (m) => m.tenantId === tenantId && m.id === material.moduleId
    );
    const courseVersion = moduleEntity
      ? this.state.courseVersions.find(
          (v) => v.tenantId === tenantId && v.id === moduleEntity.courseVersionId
        )
      : undefined;
    const enrollment = this.state.enrollments.find(
      (e) => e.tenantId === tenantId && e.id === enrollmentId
    );
    if (!enrollment || !courseVersion) {
      throw new NotFoundException({
        code: 'not_found',
        message: 'Зачисление для этого урока не найдено'
      });
    }
    const hasGroupCourseAccess = this.state.groupCourses.some(
      (gc) =>
        gc.tenantId === tenantId &&
        gc.groupId === enrollment.groupId &&
        gc.courseId === courseVersion.courseId
    );
    if (!hasGroupCourseAccess) {
      throw new PreconditionFailedException({
        code: 'domain_rule_violation',
        message: 'Зачисление не связано с курсом этого урока'
      });
    }
    // Ссылку получает владелец зачисления (или тот, кому разрешено действовать за него).
    this.mvp.assertActorMatchesLearnerIamLink(
      tenantId,
      actorId,
      enrollment.learnerId,
      ctx.permissions
    );
  }
}
