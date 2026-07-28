import { BadRequestException, Inject, Injectable } from '@nestjs/common';

import { VideoAccessService } from './video-access.service.js';
import { VIDEO_ASSETS_REPOSITORY, type VideoAssetsRepository } from './video-assets.repository.js';
import {
  VIDEO_PROGRESS_REPOSITORY,
  type VideoProgressRepository
} from './video-progress.repository.js';
import {
  NO_SEEK_TOLERANCE_SECONDS,
  accumulateRanges,
  completionThreshold,
  coverageRatio,
  coveredSeconds,
  dropSeekedAheadRanges
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
  /**
   * ФТ-B3.2: перемотка вперёд запрещена прямо сейчас. Интерфейс по этому полю прячет
   * возможность мотать; но даже если его проигнорировать, зачёт всё равно даёт сервер.
   */
  seekForwardBlocked: boolean;
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
    const threshold = completionThreshold(courseVersion.videoCompletionPercent);
    // ФТ-B3.2: «первый просмотр» — пока материал не набрал порог. Покрытие не уменьшается,
    // поэтому однажды пройденный урок остаётся свободным для перемотки навсегда.
    const alreadyCompleted =
      coverageRatio(stored?.watchedRanges ?? [], durationSeconds) >= threshold;
    const noSeekActive = Boolean(courseVersion.noSeekOnFirstView) && !alreadyCompleted;

    // Прыжок вперёд не засчитывается: отрезок, начинающийся далеко за досмотренным
    // максимумом, выбрасывается ДО слияния. Запрет в интерфейсе снимается через
    // инструменты разработчика за минуту — поэтому решает сервер.
    const incoming = noSeekActive
      ? dropSeekedAheadRanges(heartbeat.ranges ?? [], stored?.maxPositionSeconds ?? 0)
      : (heartbeat.ranges ?? []);

    const watchedRanges = accumulateRanges(stored?.watchedRanges ?? [], incoming, durationSeconds);

    const rawPosition = durationSeconds
      ? Math.min(heartbeat.positionSeconds, durationSeconds)
      : heartbeat.positionSeconds;

    // Максимум досмотренного считается по ЗАЧТЁННЫМ отрезкам, а не по заявленной позиции:
    // позиция — это лишь «где стоит плеер», и при прыжке вперёд она врёт. Отрезки уже
    // прошли антиперемоточный фильтр, поэтому их правый край — честная граница.
    // Максимум только растёт: запоздавший heartbeat не снимает заработанное право
    // перематывать (ФТ-B3.2).
    const watchedEnd = watchedRanges.reduce((max, [, to]) => Math.max(max, to), 0);
    const maxPositionSeconds = Math.max(stored?.maxPositionSeconds ?? 0, watchedEnd);

    // Позицию возобновления при запрете перемотки не пускаем дальше досмотренного:
    // иначе после прыжка слушатель вернулся бы в конец ролика (ФТ-B3.3 + ФТ-B3.2).
    const position =
      noSeekActive && rawPosition > maxPositionSeconds + NO_SEEK_TOLERANCE_SECONDS
        ? maxPositionSeconds
        : rawPosition;

    const saved = await this.progress.save(tenantId, heartbeat.enrollmentId, materialId, {
      watchedRanges,
      lastPositionSeconds: position,
      maxPositionSeconds
    });

    const ratio = coverageRatio(watchedRanges, durationSeconds);
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
      requiredPercent: Math.round(threshold * 100),
      // После зачёта перемотка свободна — пересматривать пройденное никто не запрещает.
      seekForwardBlocked: noSeekActive && !completed
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
