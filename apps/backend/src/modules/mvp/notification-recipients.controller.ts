import { Body, Controller, Get, Inject, Put, UseGuards, UseInterceptors } from '@nestjs/common';

import { MvpRequestPersistenceInterceptor } from './infrastructure/mvp-request-persistence.interceptor.js';
import { MvpService } from './mvp.service.js';
import { SetNotificationStaffRecipientsRequest } from './notification-recipients.dto.js';
import { assertValidDto } from '../../common/app-validation.pipe.js';
import { CurrentContext } from '../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { RequirePermissions } from '../iam/permission.decorator.js';
import { PermissionGuard } from '../iam/permission.guard.js';

import type { RequestContext } from '../../common/context/request-context.js';

/**
 * Phase 5C-2 — per-tenant настройка email сотрудников (admin/curator) для staff-копии
 * уведомлений. Хранится в MVP-снимке (доступен ночному cron через MvpTenantRunner),
 * поэтому контроллер идёт под MvpRequestPersistenceInterceptor. Права — общие
 * notifications.read/write (как у email-шаблонов), без новой миграции.
 */
@Controller()
@UseInterceptors(MvpRequestPersistenceInterceptor)
@UseGuards(TenantGuard)
export class NotificationRecipientsController {
  constructor(@Inject(MvpService) private readonly mvp: MvpService) {}

  @Get('notification-staff-recipients')
  @UseGuards(PermissionGuard)
  @RequirePermissions('notifications.read')
  get(@CurrentContext() c: RequestContext) {
    return { emails: this.mvp.getNotificationStaffRecipients(c.tenantId!) };
  }

  @Put('notification-staff-recipients')
  @UseGuards(PermissionGuard)
  @RequirePermissions('notifications.write')
  set(@CurrentContext() c: RequestContext, @Body() raw: unknown) {
    const body = assertValidDto(SetNotificationStaffRecipientsRequest, raw);
    return {
      emails: this.mvp.setNotificationStaffRecipients(c.tenantId!, c.userId, body.emails, c)
    };
  }
}
