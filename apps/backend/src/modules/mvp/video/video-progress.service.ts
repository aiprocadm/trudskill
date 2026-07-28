import { BadRequestException, Inject, Injectable } from '@nestjs/common';

import { VideoAccessService } from './video-access.service.js';
import { VIDEO_ASSETS_REPOSITORY, type VideoAssetsRepository } from './video-assets.repository.js';
import {
  VIDEO_PROGRESS_REPOSITORY,
  type VideoProgressRepository
} from './video-progress.repository.js';
import {
  accumulateRanges,
  completionThreshold,
  coverageRatio,
  coveredSeconds
} from './video-progress.util.js';
import { MvpService } from '../mvp.service.js';

import type { RequestContext } from '../../../common/context/request-context.js';
import type { UpdateMaterialProgressRequest } from '../mvp.dto.js';

/**
 * Прогресс по РЕАЛЬНОМУ воспроизведению и возобновление (ФТ-B3.1/B3.3, Фаза 2 Task 6).
 *
 * До этой задачи «пройдено» ставилось по времени на открытой вкладке: урок засчитывался
 * тому, кто открыл вкладку и ушёл пить чай. Теперь клиент раз в 10–15 секунд присылает
 * позицию и просмотренные отрезки, а решение «пройдено» принимает СЕРВЕР — по покрытию
 * ролика. Перемотанное, но не просмотренное, покрытием не становится.
 *
 * Общий прогресс материала остаётся там же, где был (`upsertMaterialProgress`): второй
 * источник правды о «пройдено» развалил бы расчёт модулей и курса.
 */

export interface VideoHeartbeat {
  enrollmentId: string;
  positionSeconds: number;
  /** Отрезки, проигранные с прошлого heartbeat'а: `[[from, to], ...]`. */
  ranges?: unknown[];
}

export interface VideoProgressResult {
  coveragePercent: number;
  completed: boolean;
  lastPositionSeconds: number;
  maxPositionSeconds: number;
  /** Порог зачёта курса в процентах — интерфейсу нужно показать, сколько осталось. */
  requiredPercent: number;
}

@Injectable()
export class VideoProgressService {
  constructor(
    @Inject(VideoAccessService) private readonly access: VideoAccessService,
    @Inject(VIDEO_ASSETS_REPOSITORY) private readonly assets: VideoAssetsRepository,
    @Inject(VIDEO_PROGRESS_REPOSITORY) private readonly progress: VideoProgressRepository,
    @Inject(MvpService) private readonly mvp: MvpService
  ) {}

  async record(
    tenantId: string,
    actorId: string | undefined,
    materialId: string,
    heartbeat: VideoHeartbeat,
    ctx: RequestContext
  ): Promise<VideoProgressResult> {
    const { material, courseVersion } = this.access.assertLearnerMayWatch(
      tenantId,
      actorId,
      materialId,
      heartbeat.enrollmentId,
      ctx
    );
    if (!Number.isFinite(heartbeat.positionSeconds) || heartbeat.positionSeconds < 0) {
      throw new BadRequestException({
        code: 'validation_error',
        message: 'positionSeconds must be a non-negative number'
      });
    }

    const assets = await this.assets.listByMaterial(tenantId, materialId);
    const durationSeconds = assets.find((asset) => asset.status === 'ready')?.durationSeconds;

    const stored = await this.progress.find(tenantId, heartbeat.enrollmentId, materialId);
    const watchedRanges = accumulateRanges(
      stored?.watchedRanges ?? [],
      heartbeat.ranges ?? [],
      durationSeconds
    );

    const position = durationSeconds
      ? Math.min(heartbeat.positionSeconds, durationSeconds)
      : heartbeat.positionSeconds;
    // Максимум досмотренного только растёт: запоздавший heartbeat не должен снимать
    // уже заработанное право перематывать (опора антиперемотки, ФТ-B3.2).
    const maxPositionSeconds = Math.max(stored?.maxPositionSeconds ?? 0, position);

    const saved = await this.progress.save(tenantId, heartbeat.enrollmentId, materialId, {
      watchedRanges,
      lastPositionSeconds: position,
      maxPositionSeconds
    });

    const ratio = coverageRatio(watchedRanges, durationSeconds);
    const threshold = completionThreshold(courseVersion.videoCompletionPercent);
    const completed = ratio >= threshold;

    if (completed) {
      // Зачёт отдаём существующему расчёту прогресса: он поднимет модуль и курс.
      // studiedSeconds не меньше minViewSeconds — иначе материал останется «в процессе»
      // при полностью просмотренном коротком ролике (тот же приём, что в SCORM).
      this.mvp.upsertMaterialProgress(
        tenantId,
        actorId,
        materialId,
        {
          enrollmentId: heartbeat.enrollmentId,
          studiedSeconds: Math.max(
            material.minViewSeconds,
            Math.round(coveredSeconds(watchedRanges))
          )
        } as UpdateMaterialProgressRequest,
        ctx
      );
    }

    return {
      coveragePercent: Math.round(ratio * 100),
      completed,
      lastPositionSeconds: saved.lastPositionSeconds,
      maxPositionSeconds: saved.maxPositionSeconds,
      requiredPercent: Math.round(threshold * 100)
    };
  }

  /** Где остановился слушатель (ФТ-B3.3) — плеер стартует отсюда. */
  async getResumeState(
    tenantId: string,
    enrollmentId: string,
    materialId: string
  ): Promise<{ lastPositionSeconds: number; maxPositionSeconds: number }> {
    const stored = await this.progress.find(tenantId, enrollmentId, materialId);
    return {
      lastPositionSeconds: stored?.lastPositionSeconds ?? 0,
      maxPositionSeconds: stored?.maxPositionSeconds ?? 0
    };
  }
}
