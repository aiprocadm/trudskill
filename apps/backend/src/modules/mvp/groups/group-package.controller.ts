import {
  Body,
  ConflictException,
  Controller,
  Get,
  Inject,
  Optional,
  Param,
  Post,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';

import { GroupDocumentPackageService } from './group-document-package.service.js';
import { IssueReadinessService } from './issue-readiness.service.js';
import { assertValidDto } from '../../../common/app-validation.pipe.js';
import { CurrentContext } from '../../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../../common/guards/tenant.guard.js';
import { DocumentsEnqueueService } from '../../documents/documents-enqueue.service.js';
import { DocumentsRequestPersistenceInterceptor } from '../../documents/infrastructure/documents-request-persistence.interceptor.js';
import { IssuanceReadinessService } from '../../documents/issuance-readiness.service.js';
import { RequirePermissions } from '../../iam/permission.decorator.js';
import { PermissionGuard } from '../../iam/permission.guard.js';
import { MvpRequestPersistenceInterceptor } from '../infrastructure/mvp-request-persistence.interceptor.js';
import { IssueGroupPackageRequest } from '../mvp.dto.js';
import { MvpService } from '../mvp.service.js';

import type { RequestContext } from '../../../common/context/request-context.js';

/**
 * Пакет документов группы (ТЗ перехода с CDOPROF, МГ-F2.1, срез 21.1; ТЗ §16).
 *
 * Один путь выпуска документов группы: проверка центра (журнал 660 — раньше закрытие группы
 * шло мимо неё), готовность группы и слушателей, задачи в порядке CDOPROF, публикация в
 * очередь (журнал 662–663 — без неё задачи стояли «в очереди» навсегда). Права — как у
 * куратора в ТЗ: смотреть — `documents.read`, выпускать — `documents.generate`.
 */
@Controller()
@UseInterceptors(MvpRequestPersistenceInterceptor, DocumentsRequestPersistenceInterceptor)
@UseGuards(TenantGuard)
export class GroupPackageController {
  constructor(
    @Inject(MvpService) private readonly mvp: MvpService,
    @Inject(GroupDocumentPackageService) private readonly packages: GroupDocumentPackageService,
    @Inject(IssueReadinessService) private readonly readiness: IssueReadinessService,
    @Optional()
    @Inject(IssuanceReadinessService)
    private readonly center?: IssuanceReadinessService,
    @Optional()
    @Inject(DocumentsEnqueueService)
    private readonly enqueue?: DocumentsEnqueueService
  ) {}

  @Get('groups/:groupId/document-package')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.read')
  view(@CurrentContext() c: RequestContext, @Param('groupId') groupId: string) {
    return this.packages.view(c.tenantId!, groupId);
  }

  @Post('groups/:groupId/document-package/issue')
  @UseGuards(PermissionGuard)
  @RequirePermissions('documents.generate')
  async issue(
    @CurrentContext() c: RequestContext,
    @Param('groupId') groupId: string,
    @Body() raw: unknown
  ) {
    const body = assertValidDto(IssueGroupPackageRequest, raw);
    // Журнал 660: недонастроенный центр выпускает бумагу, а не документ (Р6).
    await this.center?.assertCanIssue(c.tenantId!);
    const report = await this.readiness.report(
      c.tenantId!,
      this.mvp.issueReadinessFacts(c.tenantId!, groupId)
    );
    if (report.group.length > 0) {
      throw new ConflictException({
        code: 'package_not_ready',
        message: `Пакет выпускать рано: ${report.group.map((i) => i.message).join('; ')}.`
      });
    }
    const { outcome, tasks } = this.packages.issue(c.tenantId!, c.userId, groupId, body, report, c);
    // Журнал 662–663: созданная задача без публикации не выпустится никогда.
    await this.enqueue?.publishQueuedTasks(c.tenantId!, tasks, {
      requestId: c.requestId,
      correlationId: c.correlationId
    });
    return outcome;
  }
}
