import { Body, Controller, Get, Inject, Put, UseGuards } from '@nestjs/common';

import { VideoProviderSettingsRequest } from './video-provider-settings.dto.js';
import { VideoProviderSettingsService } from './video-provider-settings.service.js';
import { assertValidDto } from '../../../common/app-validation.pipe.js';
import { CurrentContext } from '../../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../../common/guards/tenant.guard.js';
import { RequirePermissions } from '../../iam/permission.decorator.js';
import { PermissionGuard } from '../../iam/permission.guard.js';

import type { RequestContext } from '../../../common/context/request-context.js';

/**
 * Настройка видеопоставщика центром (ФТ-B1.1, право `video.configure` из миграции `0063`).
 *
 * Отдельный контроллер, а не пара методов у `VideoController`: у того конструктор собирается
 * руками в тринадцати местах тестов, и новая зависимость роняет сборку приложения молча
 * (грабля §5.395). Ручки те же, что у вебинаров и платежей.
 */
@Controller('video')
@UseGuards(TenantGuard)
export class VideoProviderSettingsController {
  constructor(
    @Inject(VideoProviderSettingsService)
    private readonly settings: VideoProviderSettingsService
  ) {}

  @Get('provider-settings')
  @UseGuards(PermissionGuard)
  @RequirePermissions('video.configure')
  getSettings(@CurrentContext() ctx: RequestContext) {
    return this.settings.get(ctx.tenantId!);
  }

  @Put('provider-settings')
  @UseGuards(PermissionGuard)
  @RequirePermissions('video.configure')
  saveSettings(@CurrentContext() ctx: RequestContext, @Body() body: unknown) {
    const dto = assertValidDto(VideoProviderSettingsRequest, body);
    return this.settings.save(ctx.tenantId!, dto);
  }
}
