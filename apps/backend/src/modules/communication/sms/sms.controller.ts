import { Body, Controller, Get, Inject, Put, UseGuards } from '@nestjs/common';

import { SmsProviderSettingsService } from './sms-provider-settings.service.js';
import { SmsProviderSettingsRequest } from './sms.dto.js';
import { assertValidDto } from '../../../common/app-validation.pipe.js';
import { CurrentContext } from '../../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../../common/guards/tenant.guard.js';
import { RequirePermissions } from '../../iam/permission.decorator.js';
import { PermissionGuard } from '../../iam/permission.guard.js';

import type { RequestContext } from '../../../common/context/request-context.js';

/**
 * Настройка СМС-поставщика центром (ФТ-C1.3, право `sms.configure` из миграции `0068`).
 *
 * Форма — точная копия `webinars/provider-settings` и `payments/provider-settings`: у всех
 * контуров поставщиков одна и та же пара ручек под правом семейства `*.configure`.
 * За каждое сообщение платит центр, поэтому право выдано только администрации, а
 * умолчание — «выключено».
 */
@Controller('sms')
@UseGuards(TenantGuard)
export class SmsController {
  constructor(
    @Inject(SmsProviderSettingsService)
    private readonly settings: SmsProviderSettingsService
  ) {}

  @Get('provider-settings')
  @UseGuards(PermissionGuard)
  @RequirePermissions('sms.configure')
  getSettings(@CurrentContext() ctx: RequestContext) {
    return this.settings.get(ctx.tenantId!);
  }

  @Put('provider-settings')
  @UseGuards(PermissionGuard)
  @RequirePermissions('sms.configure')
  saveSettings(@CurrentContext() ctx: RequestContext, @Body() body: unknown) {
    const dto = assertValidDto(SmsProviderSettingsRequest, body);
    return this.settings.save(ctx.tenantId!, dto);
  }
}
