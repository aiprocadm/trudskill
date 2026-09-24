import { Controller, Get, Inject, Param, UseGuards, UseInterceptors } from '@nestjs/common';

import { IssueReadinessService } from './issue-readiness.service.js';
import { CurrentContext } from '../../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../../common/guards/tenant.guard.js';
import { DocumentsRequestPersistenceInterceptor } from '../../documents/infrastructure/documents-request-persistence.interceptor.js';
import { RequirePermissions } from '../../iam/permission.decorator.js';
import { PermissionGuard } from '../../iam/permission.guard.js';
import { MvpRequestPersistenceInterceptor } from '../infrastructure/mvp-request-persistence.interceptor.js';
import { MvpService } from '../mvp.service.js';

import type { RequestContext } from '../../../common/context/request-context.js';

/**
 * МГ-F5.1 (срез 20.1): «что мешает выпустить документы» группы одной ручкой.
 *
 * Отдельный контроллер, а не метод `MvpController`: ему нужны согласия и готовность центра,
 * и вешать эти зависимости на общий контроллер значило бы тащить их во все его тесты-сборки.
 * Право — чтение групп: отчёт ничего не меняет, а видеть, почему выпуск не пройдёт, нужно
 * всем, кто ведёт группу. Перехватчик документов — потому что `MvpService` держит
 * request-scoped `DocumentsService` (сторож `documents-state-wiring`).
 */
@Controller()
@UseInterceptors(MvpRequestPersistenceInterceptor, DocumentsRequestPersistenceInterceptor)
@UseGuards(TenantGuard)
export class IssueReadinessController {
  constructor(
    @Inject(MvpService) private readonly mvp: MvpService,
    @Inject(IssueReadinessService) private readonly readiness: IssueReadinessService
  ) {}

  @Get('groups/:groupId/issue-readiness')
  @UseGuards(PermissionGuard)
  @RequirePermissions('groups.read')
  async issueReadiness(@CurrentContext() c: RequestContext, @Param('groupId') groupId: string) {
    const facts = this.mvp.issueReadinessFacts(c.tenantId!, groupId);
    return this.readiness.report(c.tenantId!, facts);
  }
}
