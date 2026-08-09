import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Put,
  UseGuards
} from '@nestjs/common';

import {
  EMAIL_DELIVERIES_REPOSITORY,
  type EmailDeliveriesRepository
} from './email-deliveries.repository.js';
import { EmailResendService } from './email-resend.service.js';
import { EMAIL_TEMPLATE_DEFAULTS, type EmailTemplateKey } from './email-templates.js';
import {
  EMAIL_TEMPLATES_REPOSITORY,
  type EmailTemplatesRepository
} from './email-templates.repository.js';
import { UpsertEmailTemplateRequest } from './upsert-email-template.dto.js';
import { assertValidDto } from '../../common/app-validation.pipe.js';
import { CurrentContext } from '../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { RequirePermissions } from '../iam/permission.decorator.js';
import { PermissionGuard } from '../iam/permission.guard.js';

import type { RequestContext } from '../../common/context/request-context.js';

const KNOWN_TEMPLATE_KEYS = Object.keys(EMAIL_TEMPLATE_DEFAULTS) as EmailTemplateKey[];

@Controller()
@UseGuards(TenantGuard)
export class EmailNotificationsController {
  constructor(
    @Inject(EMAIL_TEMPLATES_REPOSITORY) private readonly templates: EmailTemplatesRepository,
    @Inject(EMAIL_DELIVERIES_REPOSITORY) private readonly deliveries: EmailDeliveriesRepository,
    @Inject(EmailResendService) private readonly resendService: EmailResendService
  ) {}

  @Get('email-deliveries')
  @UseGuards(PermissionGuard)
  @RequirePermissions('notifications.read')
  async listDeliveries(@CurrentContext() c: RequestContext) {
    return this.deliveries.list(c.tenantId!, {});
  }

  /**
   * Повторная отправка письма (Фаза 6 Task 8). Отдельного права не заводим: `notifications.write`
   * и так означает «управлять рассылками центра», а дробить его ради одной кнопки — лишняя
   * сущность в матрице прав.
   */
  @Post('email-deliveries/:id/resend')
  @UseGuards(PermissionGuard)
  @RequirePermissions('notifications.write')
  async resendDelivery(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.resendService.resend(c.tenantId!, id, c);
  }

  @Get('email-templates')
  @UseGuards(PermissionGuard)
  @RequirePermissions('notifications.read')
  async listTemplates(@CurrentContext() c: RequestContext) {
    const overrides = await this.templates.listOverrides(c.tenantId!);
    return {
      items: KNOWN_TEMPLATE_KEYS.map((key) => {
        const override = overrides.find((o) => o.templateKey === key);
        const base = override ?? EMAIL_TEMPLATE_DEFAULTS[key];
        return {
          templateKey: key,
          subject: base.subject,
          body: base.body,
          overridden: Boolean(override)
        };
      })
    };
  }

  @Put('email-templates/:key')
  @UseGuards(PermissionGuard)
  @RequirePermissions('notifications.write')
  async upsertTemplate(
    @CurrentContext() c: RequestContext,
    @Param('key') key: string,
    @Body() raw: unknown
  ) {
    if (!KNOWN_TEMPLATE_KEYS.includes(key as EmailTemplateKey)) {
      throw new BadRequestException({
        code: 'unknown_template_key',
        message: `Unknown template: ${key}`
      });
    }
    const body = assertValidDto(UpsertEmailTemplateRequest, raw);
    return this.templates.upsertOverride(c.tenantId!, key as EmailTemplateKey, {
      subject: body.subject,
      body: body.body,
      ...(c.userId ? { updatedBy: c.userId } : {})
    });
  }
}
