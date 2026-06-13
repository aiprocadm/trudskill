import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  Put,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';

import {
  CommitScormAttemptRequest,
  LaunchScormMaterialRequest,
  RegisterScormPackageRequest
} from './scorm.dto.js';
import { ScormService } from './scorm.service.js';
import { assertValidDto } from '../../../common/app-validation.pipe.js';
import { CurrentContext } from '../../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../../common/guards/tenant.guard.js';
import { RequirePermissions } from '../../iam/permission.decorator.js';
import { PermissionGuard } from '../../iam/permission.guard.js';
import { MvpRequestPersistenceInterceptor } from '../infrastructure/mvp-request-persistence.interceptor.js';
import { CreateUploadUrlRequest } from '../mvp.dto.js';

import type { RequestContext } from '../../../common/context/request-context.js';

@Controller()
@UseInterceptors(MvpRequestPersistenceInterceptor)
@UseGuards(TenantGuard)
export class ScormController {
  constructor(@Inject(ScormService) private readonly scorm: ScormService) {}

  @Post('scorm-packages/upload-url')
  @UseGuards(PermissionGuard)
  @RequirePermissions('materials.write')
  createUploadUrl(@CurrentContext() c: RequestContext, @Body() raw: unknown) {
    const b = assertValidDto(CreateUploadUrlRequest, raw);
    return this.scorm.createPackageUploadIntent(c.tenantId!, b);
  }

  @Post('scorm-packages')
  @UseGuards(PermissionGuard)
  @RequirePermissions('materials.write')
  register(@CurrentContext() c: RequestContext, @Body() raw: unknown) {
    const b = assertValidDto(RegisterScormPackageRequest, raw);
    return this.scorm.registerPackage(c.tenantId!, c.userId, b, c);
  }

  @Get('scorm-packages')
  @UseGuards(PermissionGuard)
  @RequirePermissions('materials.read')
  list(@CurrentContext() c: RequestContext) {
    return this.scorm.listPackages(c.tenantId!);
  }

  @Get('scorm-packages/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('materials.read')
  get(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.scorm.getPackageView(c.tenantId!, id);
  }

  @Post('scorm-packages/:id/process')
  @UseGuards(PermissionGuard)
  @RequirePermissions('materials.write')
  process(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.scorm.processPackage(c.tenantId!, c.userId, id, c);
  }

  @Delete('scorm-packages/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('materials.write')
  remove(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.scorm.deletePackage(c.tenantId!, c.userId, id, c);
  }

  @Post('scorm-materials/:materialId/launch')
  @UseGuards(PermissionGuard)
  @RequirePermissions('materials.read')
  launch(
    @CurrentContext() c: RequestContext,
    @Param('materialId') materialId: string,
    @Body() raw: unknown
  ) {
    const b = assertValidDto(LaunchScormMaterialRequest, raw);
    return this.scorm.launchScormMaterial(c.tenantId!, c.userId, materialId, b, c);
  }

  @Put('scorm-attempts/:id/commit')
  @UseGuards(PermissionGuard)
  @RequirePermissions('progress.recalculate')
  commit(@CurrentContext() c: RequestContext, @Param('id') id: string, @Body() raw: unknown) {
    const b = assertValidDto(CommitScormAttemptRequest, raw);
    return this.scorm.commitScormAttempt(c.tenantId!, c.userId, id, b, c);
  }
}
