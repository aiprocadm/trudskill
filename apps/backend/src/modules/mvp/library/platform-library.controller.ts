import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Post,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';

import { PublishLibraryCourseRequest } from './platform-library.dto.js';
import { PlatformLibraryService } from './platform-library.service.js';
import { assertValidDto } from '../../../common/app-validation.pipe.js';
import { CurrentContext } from '../../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../../common/guards/tenant.guard.js';
import { RequirePermissions } from '../../iam/permission.decorator.js';
import { PermissionGuard } from '../../iam/permission.guard.js';
import { MvpRequestPersistenceInterceptor } from '../infrastructure/mvp-request-persistence.interceptor.js';

import type { RequestContext } from '../../../common/context/request-context.js';

/**
 * ФТ-D6: библиотека курсов платформы.
 *
 * Наполняет каталог только владелец платформы (`library.publish`, 0078). Читает каталог и
 * копирует курс себе любой центр правом `courses.write`: копия появляется в его собственных
 * курсах — это его обычная работа, а не платформенная операция.
 */
@Controller()
@UseInterceptors(MvpRequestPersistenceInterceptor)
@UseGuards(TenantGuard)
export class PlatformLibraryController {
  constructor(@Inject(PlatformLibraryService) private readonly library: PlatformLibraryService) {}

  @Get('library/courses')
  @UseGuards(PermissionGuard)
  @RequirePermissions('courses.read')
  list() {
    return this.library.listCourses();
  }

  @Post('library/courses/:id/copy')
  @UseGuards(PermissionGuard)
  @RequirePermissions('courses.write')
  copy(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.library.copyToTenant(c.tenantId!, c.userId, id, c);
  }

  @Post('platform/library/courses')
  @UseGuards(PermissionGuard)
  @RequirePermissions('library.publish')
  publish(@CurrentContext() c: RequestContext, @Body() body: unknown) {
    const dto = assertValidDto(PublishLibraryCourseRequest, body);
    return this.library.publish(c.userId, dto, c);
  }

  @Delete('platform/library/courses/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('library.publish')
  unpublish(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.library.unpublish(c.userId, id, c);
  }
}
