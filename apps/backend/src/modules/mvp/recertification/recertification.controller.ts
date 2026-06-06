import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';

import {
  ApproveRecertificationDraftRequest,
  RejectRecertificationDraftRequest
} from './recertification.dto.js';
import { RecertificationService } from './recertification.service.js';
import { assertValidDto } from '../../../common/app-validation.pipe.js';
import { CurrentContext } from '../../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../../common/guards/tenant.guard.js';
import { RequirePermissions } from '../../iam/permission.decorator.js';
import { PermissionGuard } from '../../iam/permission.guard.js';
import { MvpRequestPersistenceInterceptor } from '../infrastructure/mvp-request-persistence.interceptor.js';

import type { RecertificationDraftStatus } from './recertification-drafts.repository.js';
import type { RequestContext } from '../../../common/context/request-context.js';

@Controller()
@UseInterceptors(MvpRequestPersistenceInterceptor)
@UseGuards(TenantGuard)
export class RecertificationController {
  constructor(@Inject(RecertificationService) private readonly service: RecertificationService) {}

  @Get('recertification-drafts')
  @UseGuards(PermissionGuard)
  @RequirePermissions('recertification.read')
  async list(@CurrentContext() c: RequestContext, @Query('status') status?: string) {
    return this.service.listDrafts(c.tenantId!, {
      ...(status ? { status: status as RecertificationDraftStatus } : {})
    });
  }

  @Post('recertification/scan')
  @UseGuards(PermissionGuard)
  @RequirePermissions('recertification.write')
  async scan(@CurrentContext() c: RequestContext) {
    return this.service.runScan(c.tenantId!, new Date().toISOString().slice(0, 10), c);
  }

  @Post('recertification-drafts/:id/approve')
  @UseGuards(PermissionGuard)
  @RequirePermissions('recertification.write')
  async approve(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Body() raw: unknown
  ) {
    const body = assertValidDto(ApproveRecertificationDraftRequest, raw);
    return this.service.approveDraft(c.tenantId!, id, body.targetGroupId, c);
  }

  @Post('recertification-drafts/:id/reject')
  @UseGuards(PermissionGuard)
  @RequirePermissions('recertification.write')
  async reject(@CurrentContext() c: RequestContext, @Param('id') id: string, @Body() raw: unknown) {
    const body = assertValidDto(RejectRecertificationDraftRequest, raw);
    return this.service.rejectDraft(c.tenantId!, id, body.reason, c);
  }
}
