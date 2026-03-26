import { Body, Controller, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentContext } from '../../common/decorators/current-context.decorator.js';
import type { RequestContext } from '../../common/context/request-context.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { RequirePermissions } from '../iam/permission.decorator.js';
import { PermissionGuard } from '../iam/permission.guard.js';
import { MvpService } from './mvp.service.js';
import type {
  BaseFilterQuery,
  CreateCourseRequest,
  CreateEnrollmentRequest,
  CreateGroupCourseRequest,
  CreateMaterialRequest,
  CreateModuleRequest,
  CreateSimpleRegistryRequest,
  UpdateCourseRequest,
  UpdateEnrollmentStatusRequest,
  UpdateMaterialProgressRequest,
  UpdateMaterialRequest,
  UpdateModuleRequest,
  UpdateSimpleRegistryRequest
} from './mvp.dto.js';

@Controller()
@UseGuards(TenantGuard)
export class MvpController {
  constructor(private readonly mvpService: MvpService) {}

  @Get('counterparties') @UseGuards(PermissionGuard) @RequirePermissions('counterparties.read')
  listCounterparties(@CurrentContext() c: RequestContext, @Query() q: BaseFilterQuery) { return this.mvpService.listCounterparties(c.tenantId!, q); }
  @Get('counterparties/:id') @UseGuards(PermissionGuard) @RequirePermissions('counterparties.read')
  getCounterparty(@CurrentContext() c: RequestContext, @Param('id') id: string) { return this.mvpService.getCounterparty(c.tenantId!, id); }
  @Post('counterparties') @UseGuards(PermissionGuard) @RequirePermissions('counterparties.write')
  createCounterparty(@CurrentContext() c: RequestContext, @Body() b: CreateSimpleRegistryRequest) { return this.mvpService.createCounterparty(c.tenantId!, c.userId, b, c); }
  @Put('counterparties/:id') @UseGuards(PermissionGuard) @RequirePermissions('counterparties.write')
  updateCounterparty(@CurrentContext() c: RequestContext, @Param('id') id: string, @Body() b: UpdateSimpleRegistryRequest) { return this.mvpService.updateCounterparty(c.tenantId!, c.userId, id, b, c); }

  @Get('learners') @UseGuards(PermissionGuard) @RequirePermissions('learners.read')
  listLearners(@CurrentContext() c: RequestContext, @Query() q: BaseFilterQuery) { return this.mvpService.listLearners(c.tenantId!, q); }
  @Get('learners/:id') @UseGuards(PermissionGuard) @RequirePermissions('learners.read')
  getLearner(@CurrentContext() c: RequestContext, @Param('id') id: string) { return this.mvpService.getLearner(c.tenantId!, id); }
  @Post('learners') @UseGuards(PermissionGuard) @RequirePermissions('learners.write')
  createLearner(@CurrentContext() c: RequestContext, @Body() b: CreateSimpleRegistryRequest) { return this.mvpService.createLearner(c.tenantId!, c.userId, b, c); }
  @Put('learners/:id') @UseGuards(PermissionGuard) @RequirePermissions('learners.write')
  updateLearner(@CurrentContext() c: RequestContext, @Param('id') id: string, @Body() b: UpdateSimpleRegistryRequest) { return this.mvpService.updateLearner(c.tenantId!, c.userId, id, b, c); }

  @Get('directions') @UseGuards(PermissionGuard) @RequirePermissions('directions.read')
  listDirections(@CurrentContext() c: RequestContext, @Query() q: BaseFilterQuery) { return this.mvpService.listDirections(c.tenantId!, q); }
  @Get('directions/:id') @UseGuards(PermissionGuard) @RequirePermissions('directions.read')
  getDirection(@CurrentContext() c: RequestContext, @Param('id') id: string) { return this.mvpService.getDirection(c.tenantId!, id); }
  @Post('directions') @UseGuards(PermissionGuard) @RequirePermissions('directions.write')
  createDirection(@CurrentContext() c: RequestContext, @Body() b: CreateSimpleRegistryRequest) { return this.mvpService.createDirection(c.tenantId!, c.userId, b, c); }
  @Put('directions/:id') @UseGuards(PermissionGuard) @RequirePermissions('directions.write')
  updateDirection(@CurrentContext() c: RequestContext, @Param('id') id: string, @Body() b: UpdateSimpleRegistryRequest) { return this.mvpService.updateDirection(c.tenantId!, c.userId, id, b, c); }

  @Get('courses') @UseGuards(PermissionGuard) @RequirePermissions('courses.read')
  listCourses(@CurrentContext() c: RequestContext, @Query() q: BaseFilterQuery) { return this.mvpService.listCourses(c.tenantId!, q); }
  @Get('courses/:id') @UseGuards(PermissionGuard) @RequirePermissions('courses.read')
  getCourse(@CurrentContext() c: RequestContext, @Param('id') id: string) { return this.mvpService.getCourse(c.tenantId!, id); }
  @Post('courses') @UseGuards(PermissionGuard) @RequirePermissions('courses.write')
  createCourse(@CurrentContext() c: RequestContext, @Body() b: CreateCourseRequest) { return this.mvpService.createCourse(c.tenantId!, c.userId, b, c); }
  @Put('courses/:id') @UseGuards(PermissionGuard) @RequirePermissions('courses.write')
  updateCourse(@CurrentContext() c: RequestContext, @Param('id') id: string, @Body() b: UpdateCourseRequest) { return this.mvpService.updateCourse(c.tenantId!, c.userId, id, b, c); }
  @Post('courses/:id/publish') @UseGuards(PermissionGuard) @RequirePermissions('courses.publish')
  publishCourse(@CurrentContext() c: RequestContext, @Param('id') id: string) { return this.mvpService.publishCourse(c.tenantId!, c.userId, id, c); }
  @Post('courses/:id/archive') @UseGuards(PermissionGuard) @RequirePermissions('courses.archive')
  archiveCourse(@CurrentContext() c: RequestContext, @Param('id') id: string) { return this.mvpService.archiveCourse(c.tenantId!, c.userId, id, c); }

  @Get('course-versions') @UseGuards(PermissionGuard) @RequirePermissions('courses.read')
  listCourseVersions(@CurrentContext() c: RequestContext, @Query() q: BaseFilterQuery) { return this.mvpService.listCourseVersions(c.tenantId!, q); }
  @Get('course-versions/:id') @UseGuards(PermissionGuard) @RequirePermissions('courses.read')
  getCourseVersion(@CurrentContext() c: RequestContext, @Param('id') id: string) { return this.mvpService.getCourseVersion(c.tenantId!, id); }
  @Post('course-versions/:courseId') @UseGuards(PermissionGuard) @RequirePermissions('courses.write')
  createCourseVersion(@CurrentContext() c: RequestContext, @Param('courseId') courseId: string) { return this.mvpService.createCourseVersion(c.tenantId!, courseId); }

  @Get('modules') @UseGuards(PermissionGuard) @RequirePermissions('materials.read')
  listModules(@CurrentContext() c: RequestContext, @Query() q: BaseFilterQuery) { return this.mvpService.listModules(c.tenantId!, q); }
  @Get('modules/:id') @UseGuards(PermissionGuard) @RequirePermissions('materials.read')
  getModule(@CurrentContext() c: RequestContext, @Param('id') id: string) { return this.mvpService.getModule(c.tenantId!, id); }
  @Post('modules') @UseGuards(PermissionGuard) @RequirePermissions('materials.write')
  createModule(@CurrentContext() c: RequestContext, @Body() b: CreateModuleRequest) { return this.mvpService.createModule(c.tenantId!, c.userId, b, c); }
  @Put('modules/:id') @UseGuards(PermissionGuard) @RequirePermissions('materials.write')
  updateModule(@CurrentContext() c: RequestContext, @Param('id') id: string, @Body() b: UpdateModuleRequest) { return this.mvpService.updateModule(c.tenantId!, c.userId, id, b, c); }

  @Get('materials') @UseGuards(PermissionGuard) @RequirePermissions('materials.read')
  listMaterials(@CurrentContext() c: RequestContext, @Query() q: BaseFilterQuery) { return this.mvpService.listMaterials(c.tenantId!, q); }
  @Get('materials/:id') @UseGuards(PermissionGuard) @RequirePermissions('materials.read')
  getMaterial(@CurrentContext() c: RequestContext, @Param('id') id: string) { return this.mvpService.getMaterial(c.tenantId!, id); }
  @Post('materials') @UseGuards(PermissionGuard) @RequirePermissions('materials.write')
  createMaterial(@CurrentContext() c: RequestContext, @Body() b: CreateMaterialRequest) { return this.mvpService.createMaterial(c.tenantId!, c.userId, b, c); }
  @Put('materials/:id') @UseGuards(PermissionGuard) @RequirePermissions('materials.write')
  updateMaterial(@CurrentContext() c: RequestContext, @Param('id') id: string, @Body() b: UpdateMaterialRequest) { return this.mvpService.updateMaterial(c.tenantId!, c.userId, id, b, c); }

  @Get('groups') @UseGuards(PermissionGuard) @RequirePermissions('groups.read')
  listGroups(@CurrentContext() c: RequestContext, @Query() q: BaseFilterQuery) { return this.mvpService.listGroups(c.tenantId!, q); }
  @Get('groups/:id') @UseGuards(PermissionGuard) @RequirePermissions('groups.read')
  getGroup(@CurrentContext() c: RequestContext, @Param('id') id: string) { return this.mvpService.getGroup(c.tenantId!, id); }
  @Post('groups') @UseGuards(PermissionGuard) @RequirePermissions('groups.write')
  createGroup(@CurrentContext() c: RequestContext, @Body() b: CreateSimpleRegistryRequest) { return this.mvpService.createGroup(c.tenantId!, c.userId, b, c); }
  @Put('groups/:id') @UseGuards(PermissionGuard) @RequirePermissions('groups.write')
  updateGroup(@CurrentContext() c: RequestContext, @Param('id') id: string, @Body() b: UpdateSimpleRegistryRequest) { return this.mvpService.updateGroup(c.tenantId!, c.userId, id, b, c); }

  @Get('group-courses') @UseGuards(PermissionGuard) @RequirePermissions('groups.read')
  listGroupCourses(@CurrentContext() c: RequestContext, @Query() q: BaseFilterQuery) { return this.mvpService.listGroupCourses(c.tenantId!, q); }
  @Get('group-courses/:id') @UseGuards(PermissionGuard) @RequirePermissions('groups.read')
  getGroupCourse(@CurrentContext() c: RequestContext, @Param('id') id: string) { return this.mvpService.getGroupCourse(c.tenantId!, id); }
  @Post('group-courses') @UseGuards(PermissionGuard) @RequirePermissions('groups.write')
  createGroupCourse(@CurrentContext() c: RequestContext, @Body() b: CreateGroupCourseRequest) { return this.mvpService.createGroupCourse(c.tenantId!, b); }

  @Get('enrollments') @UseGuards(PermissionGuard) @RequirePermissions('enrollments.read')
  listEnrollments(@CurrentContext() c: RequestContext, @Query() q: BaseFilterQuery) { return this.mvpService.listEnrollments(c.tenantId!, q); }
  @Get('enrollments/:id') @UseGuards(PermissionGuard) @RequirePermissions('enrollments.read')
  getEnrollment(@CurrentContext() c: RequestContext, @Param('id') id: string) { return this.mvpService.getEnrollment(c.tenantId!, id); }
  @Post('enrollments') @UseGuards(PermissionGuard) @RequirePermissions('enrollments.write')
  createEnrollment(@CurrentContext() c: RequestContext, @Body() b: CreateEnrollmentRequest) { return this.mvpService.createEnrollment(c.tenantId!, c.userId, b, c); }
  @Patch('enrollments/:id/status') @UseGuards(PermissionGuard) @RequirePermissions('enrollments.change_status')
  changeEnrollmentStatus(@CurrentContext() c: RequestContext, @Param('id') id: string, @Body() b: UpdateEnrollmentStatusRequest) { return this.mvpService.changeEnrollmentStatus(c.tenantId!, c.userId, id, b, c); }
  @Get('enrollments/:id/status-history') @UseGuards(PermissionGuard) @RequirePermissions('enrollments.read')
  enrollmentStatusHistory(@CurrentContext() c: RequestContext, @Param('id') id: string) { return this.mvpService.listEnrollmentStatusHistory(c.tenantId!, id); }

  @Get('progress') @UseGuards(PermissionGuard) @RequirePermissions('progress.read')
  listProgress(@CurrentContext() c: RequestContext, @Query() q: BaseFilterQuery) { return this.mvpService.listProgress(c.tenantId!, q); }
  @Get('progress/:id') @UseGuards(PermissionGuard) @RequirePermissions('progress.read')
  getProgress(@CurrentContext() c: RequestContext, @Param('id') id: string) { return this.mvpService.getProgress(c.tenantId!, id); }
  @Patch('progress/materials/:materialId') @UseGuards(PermissionGuard) @RequirePermissions('progress.recalculate')
  updateMaterialProgress(@CurrentContext() c: RequestContext, @Param('materialId') materialId: string, @Body() b: UpdateMaterialProgressRequest) { return this.mvpService.upsertMaterialProgress(c.tenantId!, c.userId, materialId, b, c); }
}
