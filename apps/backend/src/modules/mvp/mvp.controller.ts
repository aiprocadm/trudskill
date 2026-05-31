import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';
import { IsString, ValidateIf } from 'class-validator';

import { AddTestQuestionRequest, ReorderTestQuestionRequest } from './add-test-question.dto.js';
import { CreateCounterpartyExtendedRequest } from './create-counterparty-extended.dto.js';
import { MvpRequestPersistenceInterceptor } from './infrastructure/mvp-request-persistence.interceptor.js';
import { LearnerPdfCardService } from './learner-pdf-card.service.js';
import { BulkImportLearnersRequest } from './learners-bulk-import.dto.js';
import { LearnersBulkImportService } from './learners-bulk-import.service.js';
import { MvpBulkEnqueueService } from './mvp-bulk-enqueue.service.js';
import {
  AddCommissionMemberRequest,
  AddTestQuestionsRequest,
  CompleteAssignmentReviewRequest,
  CompleteAttemptReviewRequest,
  CreateAnswerHttpRequest,
  CreateAssignmentRequest,
  CreateAssignmentReviewRequest,
  CreateAssignmentSubmissionRequest,
  CreateBulkEnrollmentsRequest,
  CreateCommissionRequest,
  CreateCourseRequest,
  CreateEnrollmentRequest,
  CreateGroupCourseRequest,
  CreateMaterialRequest,
  CreateModuleRequest,
  CreateQuestionBankRequest,
  CreateQuestionRequest,
  CreateSimpleRegistryRequest,
  CreateTestRequest,
  CreateUploadUrlRequest,
  ImportQuestionsRequest,
  PatchTestRulesRequest,
  PutCourseDocumentSetRequest,
  RequestPreExamTokenRequest,
  ReturnSubmissionRequest,
  SaveAnswerRequest,
  SaveAttemptAnswerRequest,
  StartAttemptRequest,
  UpdateAssignmentRequest,
  UpdateAssignmentReviewRequest,
  UpdateAssignmentSubmissionRequest,
  UpdateCommissionRequest,
  UpdateCourseRequest,
  UpdateEnrollmentStatusRequest,
  UpdateGroupCourseRequest,
  UpdateMaterialProgressRequest,
  UpdateMaterialRequest,
  UpdateModuleRequest,
  UpdateProgramMetaRequest,
  UpdateQuestionBankRequest,
  UpdateQuestionRequest,
  UpdateSimpleRegistryRequest,
  UpdateTestRequest,
  VerifyPreExamTokenRequest
} from './mvp.dto.js';
import { MvpService } from './mvp.service.js';
import { UpdateCounterpartyExtendedRequest } from './update-counterparty-extended.dto.js';
import { UpdateLearnerExtendedRequest } from './update-learner-extended.dto.js';
import { UpdateTestRuleRequest } from './update-test-rule.dto.js';
import { assertValidDto } from '../../common/app-validation.pipe.js';
import { CurrentContext } from '../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../common/guards/tenant.guard.js';
import { RequirePermissions } from '../iam/permission.decorator.js';
import { PermissionGuard } from '../iam/permission.guard.js';

import type { BaseFilterQuery } from './mvp.dto.js';
import type { CommissionStatus } from './mvp.types.js';
import type { RequestContext } from '../../common/context/request-context.js';

/**
 * Phase 2 Plan C — mini-DTO для PATCH /groups/:id/counterparty.
 * Inline здесь, не отдельным файлом, потому что один-единственный endpoint.
 * null = снять привязку, string = id компании.
 */
class SetGroupCounterpartyRequest {
  @ValidateIf((_, v) => v !== null)
  @IsString()
  counterpartyId!: string | null;
}

@Controller()
@UseInterceptors(MvpRequestPersistenceInterceptor)
@UseGuards(TenantGuard)
export class MvpController {
  constructor(
    @Inject(MvpService) private readonly mvpService: MvpService,
    @Inject(MvpBulkEnqueueService) private readonly mvpBulkEnqueue: MvpBulkEnqueueService,
    @Inject(LearnerPdfCardService) private readonly learnerPdfCardService: LearnerPdfCardService,
    @Inject(LearnersBulkImportService)
    private readonly learnersBulkImport: LearnersBulkImportService
  ) {}

  @Get('counterparties')
  @UseGuards(PermissionGuard)
  @RequirePermissions('counterparties.read')
  listCounterparties(@CurrentContext() c: RequestContext, @Query() q: BaseFilterQuery) {
    return this.mvpService.listCounterparties(c.tenantId!, q);
  }
  @Get('counterparties/lookup')
  @UseGuards(PermissionGuard)
  @RequirePermissions('counterparties.read')
  counterpartiesLookup(@CurrentContext() c: RequestContext, @Query() q: BaseFilterQuery) {
    return this.mvpService.lookupCounterparties(c.tenantId!, q);
  }
  @Get('counterparties/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('counterparties.read')
  getCounterparty(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.mvpService.getCounterparty(c.tenantId!, id);
  }
  @Post('counterparties')
  @UseGuards(PermissionGuard)
  @RequirePermissions('counterparties.write')
  createCounterparty(@CurrentContext() c: RequestContext, @Body() raw: unknown) {
    const b = assertValidDto(CreateSimpleRegistryRequest, raw);
    return this.mvpService.createCounterparty(c.tenantId!, c.userId, b, c);
  }
  @Put('counterparties/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('counterparties.write')
  updateCounterparty(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Body() raw: unknown
  ) {
    const b = assertValidDto(UpdateSimpleRegistryRequest, raw);
    return this.mvpService.updateCounterparty(c.tenantId!, c.userId, id, b, c);
  }

  // Phase 2 Plan C — расширенный POST для компании-клиента (ИНН/КПП/контакты).
  @Post('counterparties/extended')
  @UseGuards(PermissionGuard)
  @RequirePermissions('counterparties.write')
  createCounterpartyExtended(@CurrentContext() c: RequestContext, @Body() raw: unknown) {
    const b = assertValidDto(CreateCounterpartyExtendedRequest, raw);
    return this.mvpService.createCounterpartyExtended(c.tenantId!, c.userId, b, c);
  }

  // Phase 2 Plan C — расширенный PATCH для профиля компании.
  @Patch('counterparties/:id/profile')
  @UseGuards(PermissionGuard)
  @RequirePermissions('counterparties.write')
  updateCounterpartyExtended(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Body() raw: unknown
  ) {
    const b = assertValidDto(UpdateCounterpartyExtendedRequest, raw);
    return this.mvpService.updateCounterpartyExtended(c.tenantId!, c.userId, id, b, c);
  }

  // Phase 2 Plan C — сводный прогресс по всем группам компании-клиента.
  // Требует ОБА permission: counterparties.read (доступ к сущности клиента) +
  // enrollments.read (так как агрегирует enrollment-данные).
  @Get('counterparties/:id/progress-summary')
  @UseGuards(PermissionGuard)
  @RequirePermissions('counterparties.read', 'enrollments.read')
  getCounterpartyProgressSummary(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.mvpService.getCounterpartyProgressSummary(c.tenantId!, id);
  }

  @Get('learners')
  @UseGuards(PermissionGuard)
  @RequirePermissions('learners.read')
  listLearners(@CurrentContext() c: RequestContext, @Query() q: BaseFilterQuery) {
    return this.mvpService.listLearners(c.tenantId!, q);
  }
  @Get('learners/lookup')
  @UseGuards(PermissionGuard)
  @RequirePermissions('learners.read')
  learnersLookup(@CurrentContext() c: RequestContext, @Query() q: BaseFilterQuery) {
    return this.mvpService.lookupLearners(c.tenantId!, q);
  }
  @Get('learners/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('learners.read')
  getLearner(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.mvpService.getLearner(c.tenantId!, id);
  }
  /**
   * Pillar A Plan C §5.11 — JSON-агрегат для PDF-карточки ученика.
   * Реальный binary PDF — Phase 5; сейчас фронт рендерит секции из этого JSON.
   */
  @Get('learners/:id/pdf-card')
  @UseGuards(PermissionGuard)
  @RequirePermissions('learners.read')
  getLearnerPdfCard(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.learnerPdfCardService.composeData(c.tenantId!, c.userId, id, c);
  }
  @Post('learners')
  @UseGuards(PermissionGuard)
  @RequirePermissions('learners.write')
  createLearner(@CurrentContext() c: RequestContext, @Body() raw: unknown) {
    const b = assertValidDto(CreateSimpleRegistryRequest, raw);
    return this.mvpService.createLearner(c.tenantId!, c.userId, b, c);
  }
  /**
   * Phase 2 Plan A — bulk-import учеников из Excel.
   * Создаёт недостающих + зачисляет всех валидных в группу одной операцией.
   * Требует обе permission: `learners.write` (создание) + `enrollments.write` (зачисление).
   */
  @Post('learners/bulk-import')
  @UseGuards(PermissionGuard)
  @RequirePermissions('learners.write', 'enrollments.write')
  bulkImportLearners(@CurrentContext() c: RequestContext, @Body() raw: unknown) {
    const b = assertValidDto(BulkImportLearnersRequest, raw);
    return this.learnersBulkImport.bulkImportLearners(c.tenantId!, c.userId, b, c);
  }
  @Put('learners/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('learners.write')
  updateLearner(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Body() raw: unknown
  ) {
    const b = assertValidDto(UpdateSimpleRegistryRequest, raw);
    return this.mvpService.updateLearner(c.tenantId!, c.userId, id, b, c);
  }
  /**
   * Phase 2 Plan B — PATCH расширенных полей учётки (ФИО, email, СНИЛС, должность, status).
   * Отдельный путь от `PUT /learners/:id`, который остаётся под `UpdateSimpleRegistryRequest`
   * (старый шейп: code+name+linkedIamUserId+organizationUnitId).
   */
  @Patch('learners/:id/profile')
  @UseGuards(PermissionGuard)
  @RequirePermissions('learners.write')
  updateLearnerExtended(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Body() raw: unknown
  ) {
    const b = assertValidDto(UpdateLearnerExtendedRequest, raw);
    return this.mvpService.updateLearnerExtended(c.tenantId!, c.userId, id, b, c);
  }

  @Get('directions')
  @UseGuards(PermissionGuard)
  @RequirePermissions('directions.read')
  listDirections(@CurrentContext() c: RequestContext, @Query() q: BaseFilterQuery) {
    return this.mvpService.listDirections(c.tenantId!, q);
  }
  @Get('directions/lookup')
  @UseGuards(PermissionGuard)
  @RequirePermissions('directions.read')
  directionsLookup(@CurrentContext() c: RequestContext, @Query() q: BaseFilterQuery) {
    return this.mvpService.lookupDirections(c.tenantId!, q);
  }
  @Get('directions/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('directions.read')
  getDirection(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.mvpService.getDirection(c.tenantId!, id);
  }
  @Post('directions')
  @UseGuards(PermissionGuard)
  @RequirePermissions('directions.write')
  createDirection(@CurrentContext() c: RequestContext, @Body() raw: unknown) {
    const b = assertValidDto(CreateSimpleRegistryRequest, raw);
    return this.mvpService.createDirection(c.tenantId!, c.userId, b, c);
  }
  @Put('directions/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('directions.write')
  updateDirection(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Body() raw: unknown
  ) {
    const b = assertValidDto(UpdateSimpleRegistryRequest, raw);
    return this.mvpService.updateDirection(c.tenantId!, c.userId, id, b, c);
  }

  @Get('courses')
  @UseGuards(PermissionGuard)
  @RequirePermissions('courses.read')
  listCourses(@CurrentContext() c: RequestContext, @Query() q: BaseFilterQuery) {
    return this.mvpService.listCourses(c.tenantId!, q);
  }
  @Get('courses/lookup')
  @UseGuards(PermissionGuard)
  @RequirePermissions('courses.read')
  coursesLookup(@CurrentContext() c: RequestContext, @Query() q: BaseFilterQuery) {
    return this.mvpService.lookupCourses(c.tenantId!, q);
  }
  @Get('courses/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('courses.read')
  getCourse(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.mvpService.getCourse(c.tenantId!, id);
  }
  @Post('courses')
  @UseGuards(PermissionGuard)
  @RequirePermissions('courses.write')
  createCourse(@CurrentContext() c: RequestContext, @Body() raw: unknown) {
    const b = assertValidDto(CreateCourseRequest, raw);
    return this.mvpService.createCourse(c.tenantId!, c.userId, b, c);
  }
  @Put('courses/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('courses.write')
  updateCourse(@CurrentContext() c: RequestContext, @Param('id') id: string, @Body() raw: unknown) {
    const b = assertValidDto(UpdateCourseRequest, raw);
    return this.mvpService.updateCourse(c.tenantId!, c.userId, id, b, c);
  }
  @Post('courses/:id/publish')
  @UseGuards(PermissionGuard)
  @RequirePermissions('courses.publish')
  publishCourse(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.mvpService.publishCourse(c.tenantId!, c.userId, id, c);
  }
  @Post('courses/:id/archive')
  @UseGuards(PermissionGuard)
  @RequirePermissions('courses.archive')
  archiveCourse(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.mvpService.archiveCourse(c.tenantId!, c.userId, id, c);
  }

  @Get('course-versions')
  @UseGuards(PermissionGuard)
  @RequirePermissions('courses.read')
  listCourseVersions(@CurrentContext() c: RequestContext, @Query() q: BaseFilterQuery) {
    return this.mvpService.listCourseVersions(c.tenantId!, q);
  }
  @Get('course-versions/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('courses.read')
  getCourseVersion(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.mvpService.getCourseVersion(c.tenantId!, id);
  }
  @Post('course-versions/:courseId')
  @UseGuards(PermissionGuard)
  @RequirePermissions('courses.write')
  createCourseVersion(@CurrentContext() c: RequestContext, @Param('courseId') courseId: string) {
    return this.mvpService.createCourseVersion(c.tenantId!, courseId);
  }

  @Get('modules')
  @UseGuards(PermissionGuard)
  @RequirePermissions('materials.read')
  listModules(@CurrentContext() c: RequestContext, @Query() q: BaseFilterQuery) {
    return this.mvpService.listModules(c.tenantId!, q);
  }
  @Get('modules/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('materials.read')
  getModule(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.mvpService.getModule(c.tenantId!, id);
  }
  @Post('modules')
  @UseGuards(PermissionGuard)
  @RequirePermissions('materials.write')
  createModule(@CurrentContext() c: RequestContext, @Body() raw: unknown) {
    const b = assertValidDto(CreateModuleRequest, raw);
    return this.mvpService.createModule(c.tenantId!, c.userId, b, c);
  }
  @Put('modules/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('materials.write')
  updateModule(@CurrentContext() c: RequestContext, @Param('id') id: string, @Body() raw: unknown) {
    const b = assertValidDto(UpdateModuleRequest, raw);
    return this.mvpService.updateModule(c.tenantId!, c.userId, id, b, c);
  }

  @Get('materials')
  @UseGuards(PermissionGuard)
  @RequirePermissions('materials.read')
  listMaterials(@CurrentContext() c: RequestContext, @Query() q: BaseFilterQuery) {
    return this.mvpService.listMaterials(c.tenantId!, q);
  }
  @Get('materials/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('materials.read')
  getMaterial(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.mvpService.getMaterial(c.tenantId!, id);
  }
  @Post('materials')
  @UseGuards(PermissionGuard)
  @RequirePermissions('materials.write')
  createMaterial(@CurrentContext() c: RequestContext, @Body() raw: unknown) {
    const b = assertValidDto(CreateMaterialRequest, raw);
    return this.mvpService.createMaterial(c.tenantId!, c.userId, b, c);
  }
  @Put('materials/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('materials.write')
  updateMaterial(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Body() raw: unknown
  ) {
    const b = assertValidDto(UpdateMaterialRequest, raw);
    return this.mvpService.updateMaterial(c.tenantId!, c.userId, id, b, c);
  }

  @Get('groups')
  @UseGuards(PermissionGuard)
  @RequirePermissions('groups.read')
  listGroups(@CurrentContext() c: RequestContext, @Query() q: BaseFilterQuery) {
    return this.mvpService.listGroups(c.tenantId!, q);
  }
  @Get('groups/lookup')
  @UseGuards(PermissionGuard)
  @RequirePermissions('groups.read')
  groupsLookup(@CurrentContext() c: RequestContext, @Query() q: BaseFilterQuery) {
    return this.mvpService.lookupGroups(c.tenantId!, q);
  }
  @Get('groups/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('groups.read')
  getGroup(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.mvpService.getGroup(c.tenantId!, id);
  }
  @Post('groups')
  @UseGuards(PermissionGuard)
  @RequirePermissions('groups.write')
  createGroup(@CurrentContext() c: RequestContext, @Body() raw: unknown) {
    const b = assertValidDto(CreateSimpleRegistryRequest, raw);
    return this.mvpService.createGroup(c.tenantId!, c.userId, b, c);
  }
  @Put('groups/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('groups.write')
  updateGroup(@CurrentContext() c: RequestContext, @Param('id') id: string, @Body() raw: unknown) {
    const b = assertValidDto(UpdateSimpleRegistryRequest, raw);
    return this.mvpService.updateGroup(c.tenantId!, c.userId, id, b, c);
  }

  // Phase 2 Plan C — привязать/отвязать группу к компании-клиенту.
  // counterparties.write потому что мутируется связь компании; group.write не нужно.
  @Patch('groups/:id/counterparty')
  @UseGuards(PermissionGuard)
  @RequirePermissions('counterparties.write')
  setGroupCounterparty(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Body() raw: unknown
  ) {
    const b = assertValidDto(SetGroupCounterpartyRequest, raw);
    return this.mvpService.setGroupCounterparty(c.tenantId!, c.userId, id, b.counterpartyId, c);
  }

  // Phase 2 Plan C — сводный прогресс по конкретной группе.
  @Get('groups/:id/progress-summary')
  @UseGuards(PermissionGuard)
  @RequirePermissions('enrollments.read')
  getGroupProgressSummary(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.mvpService.getGroupProgressSummary(c.tenantId!, id);
  }

  @Get('group-courses')
  @UseGuards(PermissionGuard)
  @RequirePermissions('groups.read')
  listGroupCourses(@CurrentContext() c: RequestContext, @Query() q: BaseFilterQuery) {
    return this.mvpService.listGroupCourses(c.tenantId!, q);
  }
  @Get('group-courses/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('groups.read')
  getGroupCourse(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.mvpService.getGroupCourse(c.tenantId!, id);
  }
  @Post('group-courses')
  @UseGuards(PermissionGuard)
  @RequirePermissions('groups.write')
  createGroupCourse(@CurrentContext() c: RequestContext, @Body() raw: unknown) {
    const b = assertValidDto(CreateGroupCourseRequest, raw);
    return this.mvpService.createGroupCourse(c.tenantId!, b);
  }
  @Patch('group-courses/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('groups.write')
  updateGroupCourse(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Body() raw: unknown
  ) {
    const b = assertValidDto(UpdateGroupCourseRequest, raw);
    return this.mvpService.updateGroupCourse(c.tenantId!, c.userId, id, b, c);
  }

  @Get('enrollments')
  @UseGuards(PermissionGuard)
  @RequirePermissions('enrollments.read')
  listEnrollments(@CurrentContext() c: RequestContext, @Query() q: BaseFilterQuery) {
    return this.mvpService.listEnrollments(c.tenantId!, q);
  }
  @Get('reports/kpi-snapshot')
  @UseGuards(PermissionGuard)
  @RequirePermissions('enrollments.read')
  getKpiSnapshot(@CurrentContext() c: RequestContext, @Query() q: BaseFilterQuery) {
    return this.mvpService.getKpiSnapshot(c.tenantId!, q);
  }
  @Get('enrollments/:id/certificates')
  @UseGuards(PermissionGuard)
  @RequirePermissions('enrollments.read')
  listEnrollmentCertificates(
    @CurrentContext() c: RequestContext,
    @Param('id') enrollmentId: string
  ) {
    return this.mvpService.listEnrollmentCertificates(c.tenantId!, enrollmentId, {
      actorId: c.userId,
      permissions: c.permissions
    });
  }
  /**
   * Phase 1 §4.3 — расширенный listing документов для зачисления:
   * все типы (certificate / diploma / attestation / …), не только certificate.
   * Ownership-check тот же, что у /certificates — учащийся видит только свои.
   */
  @Get('enrollments/:id/documents')
  @UseGuards(PermissionGuard)
  @RequirePermissions('enrollments.read')
  listEnrollmentDocuments(@CurrentContext() c: RequestContext, @Param('id') enrollmentId: string) {
    return this.mvpService.listEnrollmentDocuments(c.tenantId!, enrollmentId, {
      actorId: c.userId,
      permissions: c.permissions
    });
  }
  /**
   * Phase 1 §4.3 — агрегированный список «мои документы» для текущего IAM-актора.
   * Сервис сам резолвит learner-ы, привязанные к актору (linkedIamUserId).
   * Если ни одной привязки нет (admin/teacher), возвращает пустой массив —
   * это НЕ ошибка, а корректное «у вас нет документов как у слушателя».
   */
  @Get('me/documents')
  @UseGuards(PermissionGuard)
  @RequirePermissions('enrollments.read')
  listMyDocuments(@CurrentContext() c: RequestContext) {
    return this.mvpService.listMyDocuments(c.tenantId!, c.userId);
  }
  /**
   * Phase 3 Plan B — агрегированный список тестов для текущего IAM-актора (слушатель).
   * Как и `me/documents`: сервис резолвит привязанных learner-ов, без привязки — пустой
   * массив (НЕ 403).
   */
  @Get('me/tests')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.tests.read')
  listMyTests(@CurrentContext() c: RequestContext) {
    return this.mvpService.listMyTests(c.tenantId!, c.userId);
  }
  /**
   * Phase 3 Plan C — aggregated list of assignments for the current IAM actor (learner).
   * Mirrors `me/tests`: service resolves linked learner(s), returns [] (NOT 403) when unlinked.
   */
  @Get('me/assignments')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.assignments.read')
  listMyAssignments(@CurrentContext() c: RequestContext) {
    return this.mvpService.listMyAssignments(c.tenantId!, c.userId);
  }
  @Get('enrollments/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('enrollments.read')
  getEnrollment(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.mvpService.getEnrollment(c.tenantId!, id);
  }
  @Post('enrollments/bulk')
  @UseGuards(PermissionGuard)
  @RequirePermissions('enrollments.write')
  async createBulkEnrollments(@CurrentContext() c: RequestContext, @Body() raw: unknown) {
    const b = assertValidDto(CreateBulkEnrollmentsRequest, raw);
    const mode = b.deliveryMode ?? 'immediate';
    if (mode === 'queued') {
      const existing = this.mvpService.getBulkEnrollmentOutcomeIfAny(c.tenantId!, b.idempotencyKey);
      if (existing) {
        return existing;
      }
      return this.mvpBulkEnqueue.publishBulkJob(
        c.tenantId!,
        c.userId,
        b,
        c.requestId,
        c.correlationId
      );
    }
    return this.mvpService.createBulkEnrollments(c.tenantId!, c.userId, b, c);
  }
  @Post('enrollments')
  @UseGuards(PermissionGuard)
  @RequirePermissions('enrollments.write')
  createEnrollment(@CurrentContext() c: RequestContext, @Body() raw: unknown) {
    const b = assertValidDto(CreateEnrollmentRequest, raw);
    return this.mvpService.createEnrollment(c.tenantId!, c.userId, b, c);
  }
  @Patch('enrollments/:id/status')
  @UseGuards(PermissionGuard)
  @RequirePermissions('enrollments.change_status')
  changeEnrollmentStatus(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Body() raw: unknown
  ) {
    const b = assertValidDto(UpdateEnrollmentStatusRequest, raw);
    return this.mvpService.changeEnrollmentStatus(c.tenantId!, c.userId, id, b, c);
  }
  @Get('enrollments/:id/status-history')
  @UseGuards(PermissionGuard)
  @RequirePermissions('enrollments.read')
  enrollmentStatusHistory(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.mvpService.listEnrollmentStatusHistory(c.tenantId!, id);
  }

  @Get('progress')
  @UseGuards(PermissionGuard)
  @RequirePermissions('progress.read')
  listProgress(@CurrentContext() c: RequestContext, @Query() q: BaseFilterQuery) {
    return this.mvpService.listProgress(c.tenantId!, q);
  }
  @Get('progress/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('progress.read')
  getProgress(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.mvpService.getProgress(c.tenantId!, id);
  }
  @Patch('progress/materials/:materialId')
  @UseGuards(PermissionGuard)
  @RequirePermissions('progress.recalculate')
  updateMaterialProgress(
    @CurrentContext() c: RequestContext,
    @Param('materialId') materialId: string,
    @Body() raw: unknown
  ) {
    const b = assertValidDto(UpdateMaterialProgressRequest, raw);
    return this.mvpService.upsertMaterialProgress(c.tenantId!, c.userId, materialId, b, c);
  }

  @Get('question-banks')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.question_banks.read')
  listQuestionBanks(@CurrentContext() c: RequestContext, @Query() q: BaseFilterQuery) {
    return this.mvpService.listQuestionBanks(c.tenantId!, q);
  }
  @Post('question-banks')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.question_banks.write')
  createQuestionBank(@CurrentContext() c: RequestContext, @Body() raw: unknown) {
    const b = assertValidDto(CreateQuestionBankRequest, raw);
    return this.mvpService.createQuestionBank(c.tenantId!, c.userId, b, c);
  }
  @Get('question-banks/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.question_banks.read')
  getQuestionBank(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.mvpService.getQuestionBank(c.tenantId!, id);
  }
  @Patch('question-banks/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.question_banks.write')
  updateQuestionBank(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Body() raw: unknown
  ) {
    const b = assertValidDto(UpdateQuestionBankRequest, raw);
    return this.mvpService.updateQuestionBank(c.tenantId!, c.userId, id, b, c);
  }
  @Post('question-banks/:id/archive')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.question_banks.write')
  archiveQuestionBank(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.mvpService.archiveQuestionBank(c.tenantId!, c.userId, id, c);
  }
  @Get('question-banks/:id/questions')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.questions.read')
  listQuestionBankQuestions(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Query() q: BaseFilterQuery
  ) {
    return this.mvpService.listQuestionBankQuestions(c.tenantId!, id, q);
  }

  @Get('questions')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.questions.read')
  listQuestions(@CurrentContext() c: RequestContext, @Query() q: BaseFilterQuery) {
    return this.mvpService.listQuestions(c.tenantId!, q);
  }
  @Post('questions')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.questions.write')
  createQuestion(@CurrentContext() c: RequestContext, @Body() raw: unknown) {
    const b = assertValidDto(CreateQuestionRequest, raw);
    return this.mvpService.createQuestion(c.tenantId!, c.userId, b, c);
  }
  @Get('questions/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.questions.read')
  getQuestion(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.mvpService.getQuestion(c.tenantId!, id);
  }
  @Patch('questions/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.questions.write')
  updateQuestion(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Body() raw: unknown
  ) {
    const b = assertValidDto(UpdateQuestionRequest, raw);
    return this.mvpService.updateQuestion(c.tenantId!, c.userId, id, b, c);
  }
  @Post('questions/:id/archive')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.questions.write')
  archiveQuestion(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.mvpService.archiveQuestion(c.tenantId!, c.userId, id, c);
  }
  @Post('questions/import')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.questions.write')
  importQuestions(@CurrentContext() c: RequestContext, @Body() raw: unknown) {
    const b = assertValidDto(ImportQuestionsRequest, raw);
    return {
      items: b.items.map((item) => this.mvpService.createQuestion(c.tenantId!, c.userId, item, c))
    };
  }

  @Get('tests')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.tests.read')
  listTests(@CurrentContext() c: RequestContext, @Query() q: BaseFilterQuery) {
    return this.mvpService.listTests(c.tenantId!, q);
  }
  @Post('tests')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.tests.write')
  createTest(@CurrentContext() c: RequestContext, @Body() raw: unknown) {
    const b = assertValidDto(CreateTestRequest, raw);
    return this.mvpService.createTest(c.tenantId!, c.userId, b, c);
  }
  @Get('tests/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.tests.read')
  getTest(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.mvpService.getTest(c.tenantId!, id);
  }
  @Patch('tests/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.tests.write')
  updateTest(@CurrentContext() c: RequestContext, @Param('id') id: string, @Body() raw: unknown) {
    const b = assertValidDto(UpdateTestRequest, raw);
    return this.mvpService.updateTest(c.tenantId!, c.userId, id, b, c);
  }
  @Post('tests/:id/publish')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.tests.publish')
  publishTest(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.mvpService.publishTest(c.tenantId!, c.userId, id, c);
  }
  @Post('tests/:id/archive')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.tests.write')
  archiveTest(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.mvpService.archiveTest(c.tenantId!, c.userId, id, c);
  }
  @Get('tests/:id/questions')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.tests.read')
  listTestQuestions(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.mvpService.listTestQuestions(c.tenantId!, id);
  }
  @Post('tests/:id/questions')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.tests.write')
  addTestQuestions(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Body() raw: unknown
  ) {
    const b = assertValidDto(AddTestQuestionsRequest, raw);
    return this.mvpService.addTestQuestions(c.tenantId!, c.userId, id, b.questionIds, c);
  }
  @Patch('tests/:id/rules')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.tests.write')
  patchTestRules(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Body() raw: unknown
  ) {
    const b = assertValidDto(PatchTestRulesRequest, raw);
    return this.mvpService.patchTestRules(c.tenantId!, c.userId, id, b, c);
  }
  /** Phase 3 Plan A: PUT alias на patch rules — single endpoint, full upsert semantics. */
  @Put('tests/:id/rules')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.tests.write')
  putTestRules(@CurrentContext() c: RequestContext, @Param('id') id: string, @Body() raw: unknown) {
    const b = assertValidDto(UpdateTestRuleRequest, raw);
    return this.mvpService.patchTestRules(c.tenantId!, c.userId, id, b, c);
  }
  /** Phase 3 Plan A: singular add — позволяет передать конкретный sortOrder и получить TestQuestion. */
  @Post('tests/:id/questions/single')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.tests.write')
  addSingleTestQuestion(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Body() raw: unknown
  ) {
    const b = assertValidDto(AddTestQuestionRequest, raw);
    return this.mvpService.addTestQuestion(c.tenantId!, c.userId, id, b.questionId, b.sortOrder, c);
  }
  /** Phase 3 Plan A: удалить вопрос из теста (idempotent). */
  @Delete('tests/:id/questions/:questionId')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.tests.write')
  removeTestQuestion(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Param('questionId') questionId: string
  ) {
    this.mvpService.removeTestQuestion(c.tenantId!, c.userId, id, questionId, c);
    return { removed: true };
  }
  /** Phase 3 Plan A: перенумеровать вопрос в тесте. */
  @Patch('tests/:id/questions/:questionId')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.tests.write')
  reorderTestQuestion(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Param('questionId') questionId: string,
    @Body() raw: unknown
  ) {
    const b = assertValidDto(ReorderTestQuestionRequest, raw);
    return this.mvpService.reorderTestQuestion(
      c.tenantId!,
      c.userId,
      id,
      questionId,
      b.sortOrder,
      c
    );
  }
  /**
   * Phase 3 Plan A: read-only reviewer queue.
   * Plan C добавит scoring actions; здесь только агрегированный список pending.
   */
  @Get('reviewer/queue')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.reviews.review')
  getReviewerQueue(@CurrentContext() c: RequestContext) {
    return this.mvpService.getReviewerQueue(c.tenantId!, c);
  }

  @Get('attempts')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.attempts.read')
  listAttempts(@CurrentContext() c: RequestContext, @Query() q: BaseFilterQuery) {
    return this.mvpService.listAttempts(c.tenantId!, q, {
      actorId: c.userId,
      permissions: c.permissions
    });
  }
  @Post('attempts/start')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.attempts.take')
  startAttempt(@CurrentContext() c: RequestContext, @Body() raw: unknown) {
    const b = assertValidDto(StartAttemptRequest, raw);
    return this.mvpService.startAttempt(c.tenantId!, c.userId, b, c);
  }

  @Post('attempts/request-pre-exam-token')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.attempts.take')
  requestPreExamToken(@CurrentContext() c: RequestContext, @Body() raw: unknown) {
    const b = assertValidDto(RequestPreExamTokenRequest, raw);
    return this.mvpService.requestPreExamToken(c.tenantId!, c.userId, b, c);
  }

  @Post('attempts/verify-pre-exam-token')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.attempts.take')
  verifyPreExamToken(@CurrentContext() c: RequestContext, @Body() raw: unknown) {
    const b = assertValidDto(VerifyPreExamTokenRequest, raw);
    return this.mvpService.verifyPreExamToken(c.tenantId!, c.userId, b, c);
  }

  @Get('attempts/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.attempts.read')
  getAttempt(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.mvpService.getAttempt(c.tenantId!, id, {
      actorId: c.userId,
      permissions: c.permissions
    });
  }
  /**
   * Answer-safe вопросы попытки для плеера прохождения теста: возвращает
   * проекцию `AttemptQuestionView` без ключей ответа (isCorrect / numericExpected /
   * numericTolerance / expectedAnswer / explanation). Доступ — только владелец
   * попытки (assertActorMatchesLearnerIamLink в сервисе).
   */
  @Get('attempts/:id/questions')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.attempts.take')
  getAttemptQuestions(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.mvpService.getAttemptQuestions(c.tenantId!, c.userId, id, c);
  }
  @Post('attempts/:id/answers')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.attempts.take')
  saveAttemptAnswer(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Body() raw: unknown
  ) {
    const b = assertValidDto(SaveAttemptAnswerRequest, raw);
    return this.mvpService.saveAnswer(c.tenantId!, c.userId, id, b, c);
  }
  @Post('attempts/:id/submit')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.attempts.take')
  submitAttempt(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.mvpService.submitAttempt(c.tenantId!, c.userId, id, c);
  }
  @Post('attempts/:id/finish')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.attempts.take')
  finishAttempt(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.mvpService.finishAttempt(c.tenantId!, c.userId, id, c);
  }
  @Get('attempts/:id/result')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.results.read')
  getAttemptResult(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.mvpService.getAttemptResult(c.tenantId!, id, {
      actorId: c.userId,
      permissions: c.permissions
    });
  }

  @Post('answers')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.attempts.take')
  createAnswer(@CurrentContext() c: RequestContext, @Body() raw: unknown) {
    const b = assertValidDto(CreateAnswerHttpRequest, raw);
    return this.mvpService.createAnswer(c.tenantId!, c.userId, b, c);
  }
  @Patch('answers/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.attempts.take')
  patchAnswer(@CurrentContext() c: RequestContext, @Param('id') id: string, @Body() raw: unknown) {
    const b = assertValidDto(SaveAnswerRequest, raw);
    return this.mvpService.patchAnswer(c.tenantId!, c.userId, id, b, c);
  }

  @Get('exam-results')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.results.read')
  listExamResults(@CurrentContext() c: RequestContext, @Query() q: BaseFilterQuery) {
    return this.mvpService.listExamResults(c.tenantId!, q, {
      actorId: c.userId,
      permissions: c.permissions
    });
  }
  @Get('exam-results/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.results.read')
  getExamResult(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.mvpService.getExamResult(c.tenantId!, id, {
      actorId: c.userId,
      permissions: c.permissions
    });
  }
  @Get('exam-results/by-enrollment/:enrollmentId')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.results.read')
  getExamResultByEnrollment(
    @CurrentContext() c: RequestContext,
    @Param('enrollmentId') enrollmentId: string
  ) {
    return this.mvpService.getExamResultByEnrollment(c.tenantId!, enrollmentId, {
      actorId: c.userId,
      permissions: c.permissions
    });
  }
  @Post('exam-results/recalculate')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.results.read')
  recalculateExamResults(@CurrentContext() c: RequestContext) {
    return this.mvpService.recalculateExamResults(c.tenantId!);
  }

  @Get('assignments')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.assignments.read')
  listAssignments(@CurrentContext() c: RequestContext, @Query() q: BaseFilterQuery) {
    return this.mvpService.listAssignments(c.tenantId!, q);
  }
  @Post('assignments')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.assignments.write')
  createAssignment(@CurrentContext() c: RequestContext, @Body() raw: unknown) {
    const b = assertValidDto(CreateAssignmentRequest, raw);
    return this.mvpService.createAssignment(c.tenantId!, c.userId, b, c);
  }
  @Get('assignments/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.assignments.read')
  getAssignment(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.mvpService.getAssignment(c.tenantId!, id);
  }
  @Patch('assignments/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.assignments.write')
  updateAssignment(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Body() raw: unknown
  ) {
    const b = assertValidDto(UpdateAssignmentRequest, raw);
    return this.mvpService.updateAssignment(c.tenantId!, c.userId, id, b, c);
  }
  @Post('assignments/:id/publish')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.assignments.write')
  publishAssignment(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.mvpService.publishAssignment(c.tenantId!, c.userId, id, c);
  }
  @Post('assignments/:id/archive')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.assignments.write')
  archiveAssignment(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.mvpService.archiveAssignment(c.tenantId!, c.userId, id, c);
  }

  @Get('assignment-submissions')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.assignments.read')
  listAssignmentSubmissions(@CurrentContext() c: RequestContext, @Query() q: BaseFilterQuery) {
    return this.mvpService.listAssignmentSubmissions(c.tenantId!, q, {
      actorId: c.userId,
      permissions: c.permissions
    });
  }
  @Post('assignment-submissions')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.submissions.submit')
  createAssignmentSubmission(@CurrentContext() c: RequestContext, @Body() raw: unknown) {
    const b = assertValidDto(CreateAssignmentSubmissionRequest, raw);
    return this.mvpService.createAssignmentSubmission(c.tenantId!, c.userId, b, c);
  }
  @Get('assignment-submissions/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.assignments.read')
  getAssignmentSubmission(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.mvpService.getAssignmentSubmission(c.tenantId!, id, {
      actorId: c.userId,
      permissions: c.permissions
    });
  }
  @Patch('assignment-submissions/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.submissions.submit')
  updateAssignmentSubmission(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Body() raw: unknown
  ) {
    const b = assertValidDto(UpdateAssignmentSubmissionRequest, raw);
    return this.mvpService.updateAssignmentSubmission(c.tenantId!, c.userId, id, b, c);
  }
  @Post('assignment-submissions/:id/submit')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.submissions.submit')
  submitAssignmentSubmission(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.mvpService.submitAssignmentSubmission(c.tenantId!, c.userId, id, c);
  }

  // === Phase 3 Plan C — presigned upload + return + complete-review ===

  @Post('assignment-submissions/:id/upload-url')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.submissions.submit')
  createSubmissionUploadUrl(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Body() raw: unknown
  ) {
    const b = assertValidDto(CreateUploadUrlRequest, raw);
    return this.mvpService.createSubmissionUploadIntent(c.tenantId!, c.userId, id, b, c);
  }

  @Get('assignment-submissions/:id/file-url')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.assignments.read')
  getSubmissionFileUrl(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.mvpService.getSubmissionFileUrl(c.tenantId!, id, {
      actorId: c.userId,
      permissions: c.permissions
    });
  }

  @Post('assignment-submissions/:id/return')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.reviews.review')
  returnAssignmentSubmission(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Body() raw: unknown
  ) {
    const b = assertValidDto(ReturnSubmissionRequest, raw);
    return this.mvpService.returnAssignmentSubmission(c.tenantId!, c.userId, id, b, c);
  }

  @Post('attempts/:id/complete-review')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.reviews.review')
  completeAttemptReview(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Body() raw: unknown
  ) {
    const b = assertValidDto(CompleteAttemptReviewRequest, raw);
    return this.mvpService.completeAttemptReview(c.tenantId!, c.userId, id, b, c);
  }

  @Get('assignment-reviews')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.reviews.review')
  listAssignmentReviews(@CurrentContext() c: RequestContext, @Query() q: BaseFilterQuery) {
    return this.mvpService.listAssignmentReviews(c.tenantId!, q);
  }
  @Post('assignment-reviews')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.reviews.review')
  createAssignmentReview(@CurrentContext() c: RequestContext, @Body() raw: unknown) {
    const b = assertValidDto(CreateAssignmentReviewRequest, raw);
    return this.mvpService.createAssignmentReview(c.tenantId!, c.userId, b, c);
  }
  @Get('assignment-reviews/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.reviews.review')
  getAssignmentReview(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.mvpService.getAssignmentReview(c.tenantId!, id);
  }
  @Patch('assignment-reviews/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.reviews.review')
  updateAssignmentReview(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Body() raw: unknown
  ) {
    const b = assertValidDto(UpdateAssignmentReviewRequest, raw);
    return this.mvpService.updateAssignmentReview(c.tenantId!, c.userId, id, b, c);
  }
  @Post('assignment-reviews/:id/complete')
  @UseGuards(PermissionGuard)
  @RequirePermissions('assessment.reviews.review')
  completeAssignmentReview(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Body() raw: unknown
  ) {
    const b = assertValidDto(CompleteAssignmentReviewRequest, raw);
    return this.mvpService.completeAssignmentReview(c.tenantId!, c.userId, id, b, c);
  }

  // === Pillar A — Plan A (§5.2): commissions HTTP ===

  @Get('commissions')
  @UseGuards(PermissionGuard)
  @RequirePermissions('learning.commissions.read')
  listCommissions(@CurrentContext() c: RequestContext, @Query('status') status?: CommissionStatus) {
    return { items: this.mvpService.listCommissions(c.tenantId!, status) };
  }
  @Get('commissions/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('learning.commissions.read')
  getCommission(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    const commission = this.mvpService.getCommission(c.tenantId!, id);
    const members = this.mvpService.listCommissionMembers(c.tenantId!, id);
    return { ...commission, members };
  }
  @Post('commissions')
  @UseGuards(PermissionGuard)
  @RequirePermissions('learning.commissions.write')
  createCommission(@CurrentContext() c: RequestContext, @Body() raw: unknown) {
    const b = assertValidDto(CreateCommissionRequest, raw);
    return this.mvpService.createCommission(c.tenantId!, c.userId, b, c);
  }
  @Patch('commissions/:id')
  @UseGuards(PermissionGuard)
  @RequirePermissions('learning.commissions.write')
  updateCommission(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Body() raw: unknown
  ) {
    const b = assertValidDto(UpdateCommissionRequest, raw);
    return this.mvpService.updateCommission(c.tenantId!, c.userId, id, b, c);
  }
  @Post('commissions/:id/archive')
  @UseGuards(PermissionGuard)
  @RequirePermissions('learning.commissions.write')
  archiveCommission(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.mvpService.archiveCommission(c.tenantId!, c.userId, id, c);
  }
  @Post('commissions/:id/members')
  @UseGuards(PermissionGuard)
  @RequirePermissions('learning.commissions.write')
  addCommissionMember(
    @CurrentContext() c: RequestContext,
    @Param('id') commissionId: string,
    @Body() raw: unknown
  ) {
    const b = assertValidDto(AddCommissionMemberRequest, raw);
    return this.mvpService.addCommissionMember(c.tenantId!, c.userId, commissionId, b, c);
  }
  @Delete('commissions/:id/members/:memberId')
  @UseGuards(PermissionGuard)
  @RequirePermissions('learning.commissions.write')
  removeCommissionMember(
    @CurrentContext() c: RequestContext,
    @Param('id') commissionId: string,
    @Param('memberId') memberId: string
  ) {
    this.mvpService.removeCommissionMember(c.tenantId!, c.userId, commissionId, memberId, c);
    return { ok: true };
  }

  // === Pillar A — Plan A (§5.1): program meta + course version publish ===

  @Patch('course-versions/:id/program-meta')
  @UseGuards(PermissionGuard)
  @RequirePermissions('courses.write')
  updateProgramMeta(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Body() raw: unknown
  ) {
    const b = assertValidDto(UpdateProgramMetaRequest, raw);
    return this.mvpService.updateProgramMeta(c.tenantId!, c.userId, id, b, c);
  }
  @Post('course-versions/:id/publish')
  @UseGuards(PermissionGuard)
  @RequirePermissions('learning.courses.publish')
  publishCourseVersion(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return this.mvpService.publishCourseVersion(c.tenantId!, c.userId, id, c);
  }

  // === Pillar A — Plan A (§5.3): course document sets ===

  @Get('course-versions/:id/document-set')
  @UseGuards(PermissionGuard)
  @RequirePermissions('learning.course_document_sets.read')
  getCourseDocumentSet(@CurrentContext() c: RequestContext, @Param('id') id: string) {
    return { items: this.mvpService.getCourseDocumentSet(c.tenantId!, id) };
  }

  // === Pillar A — Plan A (§5.5): regulatory acts lookup ===

  @Get('regulatory-acts')
  @UseGuards(PermissionGuard)
  @RequirePermissions('courses.read')
  listRegulatoryActs() {
    return { items: this.mvpService.listRegulatoryActs() };
  }
  @Put('course-versions/:id/document-set')
  @UseGuards(PermissionGuard)
  @RequirePermissions('learning.course_document_sets.write')
  setCourseDocumentSet(
    @CurrentContext() c: RequestContext,
    @Param('id') id: string,
    @Body() raw: unknown
  ) {
    const b = assertValidDto(PutCourseDocumentSetRequest, raw);
    return { items: this.mvpService.setCourseDocumentSet(c.tenantId!, c.userId, id, b, c) };
  }
}
