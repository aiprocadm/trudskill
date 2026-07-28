import { Body, Controller, Inject, Param, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { IsString, MinLength } from 'class-validator';

import { VideoPlaybackService } from './video-playback.service.js';
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
  constructor(@Inject(VideoPlaybackService) private readonly playback: VideoPlaybackService) {}

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
}
