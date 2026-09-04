import {
  Body,
  Controller,
  Get,
  Header,
  Inject,
  Param,
  Post,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';
import { IsArray, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

import { DocumentMaterialService } from './document-material.service.js';
import { LearningHoursService, renderLearningJournalCsv } from './learning-hours.service.js';
import { VideoPlaybackService } from './video-playback.service.js';
import { VideoProgressService } from './video-progress.service.js';
import { assertValidDto } from '../../../common/app-validation.pipe.js';
import { CurrentContext } from '../../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../../common/guards/tenant.guard.js';
import { RequirePermissions } from '../../iam/permission.decorator.js';
import { PermissionGuard } from '../../iam/permission.guard.js';
import { MvpRequestPersistenceInterceptor } from '../infrastructure/mvp-request-persistence.interceptor.js';

import type { RequestContext } from '../../../common/context/request-context.js';

class PlaybackRequestDto {
  /** Зачисление, по которому слушатель смотрит урок — именно оно даёт право на ссылку. */
  @IsString()
  @MinLength(1)
  enrollmentId!: string;
}

class VideoHeartbeatDto {
  @IsString()
  @MinLength(1)
  enrollmentId!: string;

  /** Текущая позиция плеера, секунды. */
  @IsNumber()
  @Min(0)
  positionSeconds!: number;

  /**
   * Отрезки, проигранные с прошлого heartbeat'а. Форму каждого элемента проверяет уже
   * математика слияния (`mergeRanges`) — она обязана переживать любой мусор от клиента,
   * поэтому здесь достаточно «это массив».
   */
  @IsOptional()
  @IsArray()
  ranges?: unknown[];
}

/**
 * Выдача ссылки на просмотр (ФТ-B2.1, Фаза 2 Task 4).
 *
 * POST, а не GET: ссылка одноразово-короткоживущая и её нельзя кэшировать ни браузеру,
 * ни прокси. Интерцептор персистенса — как у SCORM: проверка доступа читает состояние
 * тенанта (материалы, модули, зачисления).
 */
@Controller()
@UseInterceptors(MvpRequestPersistenceInterceptor)
@UseGuards(TenantGuard)
export class VideoPlaybackController {
  constructor(
    @Inject(VideoPlaybackService) private readonly playback: VideoPlaybackService,
    @Inject(VideoProgressService) private readonly progress: VideoProgressService,
    @Inject(LearningHoursService) private readonly hours: LearningHoursService,
    @Inject(DocumentMaterialService) private readonly documents: DocumentMaterialService
  ) {}

  /**
   * Открыть документ урока (ФТ-B4.1): ссылка на файл + фиксация факта открытия.
   * POST, потому что запрос МЕНЯЕТ состояние (пишет прогресс), а ссылка не кэшируется.
   */
  @Post('document-materials/:materialId/open')
  @UseGuards(PermissionGuard)
  @RequirePermissions('progress.recalculate')
  openDocument(
    @CurrentContext() c: RequestContext,
    @Param('materialId') materialId: string,
    @Body() raw: unknown
  ) {
    const body = assertValidDto(PlaybackRequestDto, raw);
    return this.documents.open(c.tenantId!, c.userId, materialId, body.enrollmentId, c);
  }

  @Post('video-materials/:materialId/playback')
  @UseGuards(PermissionGuard)
  @RequirePermissions('video.read')
  getPlayback(
    @CurrentContext() c: RequestContext,
    @Param('materialId') materialId: string,
    @Body() raw: unknown
  ) {
    const body = assertValidDto(PlaybackRequestDto, raw);
    return this.playback.getPlayback(c.tenantId!, c.userId, materialId, body.enrollmentId, c);
  }

  /**
   * Heartbeat просмотра (ФТ-B3.1): клиент шлёт позицию и проигранные отрезки каждые
   * 10–15 секунд, решение «пройдено» принимает сервер.
   */
  @Post('video-materials/:materialId/progress')
  @UseGuards(PermissionGuard)
  @RequirePermissions('progress.recalculate')
  recordProgress(
    @CurrentContext() c: RequestContext,
    @Param('materialId') materialId: string,
    @Body() raw: unknown
  ) {
    const body = assertValidDto(VideoHeartbeatDto, raw);
    return this.progress.record(c.tenantId!, c.userId, materialId, body, c);
  }

  /**
   * Журнал учебных часов группы (ФТ-B3.4) — доказательная база на проверке ГИТ/Минтруда:
   * фактическое время против плановых часов программы по каждому слушателю.
   *
   * Журнал 341: право — `groups.read`, как у карточки группы и её сводки, а не
   * `progress.read`. Последнее есть у слушателя (оно про СВОЙ прогресс), а журнал —
   * реестр всей группы: имена, статусы и часы чужих людей, резать его «по себе» нечем.
   */
  @Get('groups/:groupId/learning-journal')
  @UseGuards(PermissionGuard)
  @RequirePermissions('groups.read')
  learningJournal(@CurrentContext() c: RequestContext, @Param('groupId') groupId: string) {
    return this.hours.getGroupJournal(c.tenantId!, groupId);
  }

  /** Тот же журнал файлом: на проверке просят выгрузку, а не скриншот. */
  @Get('groups/:groupId/learning-journal.csv')
  @UseGuards(PermissionGuard)
  @RequirePermissions('groups.read')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async learningJournalCsv(@CurrentContext() c: RequestContext, @Param('groupId') groupId: string) {
    return renderLearningJournalCsv(await this.hours.getGroupJournal(c.tenantId!, groupId));
  }
}
