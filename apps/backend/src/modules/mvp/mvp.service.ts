import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  PreconditionFailedException
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

import { ENROLLMENT_COMPLETED_EVENT } from './enrollment-completed.event.js';
import { InMemoryMvpState } from './infrastructure/in-memory-mvp.state.js';
import { MVP_STATE } from './infrastructure/mvp-state.token.js';
import { TenantScopedRepository } from '../../infrastructure/database/tenant-repository.js';
import { AuditService } from '../audit/audit.service.js';
import { FilesService } from '../files/files.service.js';

import type {
  BaseFilterQuery,
  CreateAssignmentRequest,
  CreateAssignmentReviewRequest,
  CreateAssignmentSubmissionRequest,
  CreateCourseRequest,
  CreateEnrollmentRequest,
  CreateGroupCourseRequest,
  CreateMaterialRequest,
  CreateModuleRequest,
  CreateQuestionBankRequest,
  CreateQuestionRequest,
  CreateSimpleRegistryRequest,
  CreateTestRequest,
  PatchTestRulesRequest,
  SaveAnswerRequest,
  SaveAttemptAnswerRequest,
  StartAttemptRequest,
  TestRulesDto,
  UpdateAssignmentRequest,
  UpdateAssignmentReviewRequest,
  UpdateAssignmentSubmissionRequest,
  UpdateCourseRequest,
  UpdateEnrollmentStatusRequest,
  UpdateGroupCourseRequest,
  UpdateMaterialProgressRequest,
  UpdateMaterialRequest,
  UpdateModuleRequest,
  UpdateQuestionBankRequest,
  UpdateQuestionRequest,
  UpdateSimpleRegistryRequest,
  UpdateTestRequest
} from './mvp.dto.js';
import type {
  Assignment,
  AssignmentReview,
  AssignmentSubmission,
  Attempt,
  AttemptAnswer,
  BaseEntity,
  Counterparty,
  Course,
  CourseModuleEntity,
  CourseProgress,
  CourseVersion,
  Direction,
  Enrollment,
  EnrollmentStatus,
  EnrollmentStatusHistory,
  ExamResult,
  GroupCourse,
  GroupEntity,
  Learner,
  Material,
  MaterialProgress,
  ModuleProgress,
  ProgressStatus,
  Question,
  QuestionBank,
  TestAttempt,
  TestEntity,
  TestQuestion
} from './mvp.types.js';
import type { RequestContext } from '../../common/context/request-context.js';

interface ListResponse<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

interface LookupItem {
  id: string;
  label: string;
  status: string;
}

/** Контекст для GET/list assessment: ограничение по linkedIamUserId для слушателя. */
interface MvpAssessmentReadAccess {
  actorId?: string;
  permissions?: string[];
}

const DEFAULT_GROUP_COURSE_DURATION_DAYS = 90;

/** Обход ограничения linkedIam/list-scope для GET/list assessment — только через IAM permission. */
const ASSESSMENT_READ_CROSS_LEARNER_PERMISSION = 'assessment.read.cross_learner';

@Injectable()
export class MvpService {
  constructor(
    @Inject(MVP_STATE) private readonly state: InMemoryMvpState,
    @Inject(TenantScopedRepository) private readonly tenantScopedRepository: TenantScopedRepository,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(FilesService) private readonly filesService: FilesService,
    @Inject(EventEmitter2) private readonly events: EventEmitter2
  ) {}

  listCounterparties(tenantId: string, query: BaseFilterQuery): ListResponse<Counterparty> {
    return this.list(this.state.counterparties, tenantId, query);
  }

  getCounterparty(tenantId: string, id: string): Counterparty {
    return this.getById(this.state.counterparties, tenantId, id);
  }

  lookupCounterparties(tenantId: string, query: BaseFilterQuery): ListResponse<LookupItem> {
    return this.lookup(this.state.counterparties, tenantId, query, (item) => item.name);
  }

  createCounterparty(
    tenantId: string,
    actorId: string | undefined,
    request: CreateSimpleRegistryRequest,
    context: RequestContext
  ): Counterparty {
    const entity: Counterparty = {
      id: this.id('cp'),
      tenantId,
      code: request.code,
      name: request.name,
      legalName: request.name,
      status: request.status ?? 'active',
      createdAt: this.now(),
      updatedAt: this.now()
    };
    this.state.counterparties.push(entity);
    this.audit(
      tenantId,
      actorId,
      'crm.counterparty_created',
      'crm.counterparty',
      entity.id,
      undefined,
      entity,
      context
    );
    return entity;
  }

  updateCounterparty(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    request: UpdateSimpleRegistryRequest,
    context: RequestContext
  ): Counterparty {
    const current = this.getById(this.state.counterparties, tenantId, id);
    const oldValues = { ...current };
    Object.assign(current, request, { updatedAt: this.now() });
    this.audit(
      tenantId,
      actorId,
      'crm.counterparty_updated',
      'crm.counterparty',
      current.id,
      oldValues,
      current,
      context
    );
    return current;
  }

  listLearners(tenantId: string, query: BaseFilterQuery): ListResponse<Learner> {
    return this.list(this.state.learners, tenantId, query);
  }

  getLearner(tenantId: string, id: string): Learner {
    return this.getById(this.state.learners, tenantId, id);
  }

  lookupLearners(tenantId: string, query: BaseFilterQuery): ListResponse<LookupItem> {
    return this.lookup(this.state.learners, tenantId, query, (item) =>
      `${item.firstName} ${item.lastName}`.trim()
    );
  }

  createLearner(
    tenantId: string,
    actorId: string | undefined,
    request: CreateSimpleRegistryRequest,
    context: RequestContext
  ): Learner {
    const [firstName, lastName] = request.name.split(' ');
    const entity: Learner = {
      id: this.id('learner'),
      tenantId,
      learnerNo: request.code,
      firstName: firstName ?? request.name,
      lastName: lastName ?? '',
      email: undefined,
      linkedIamUserId: request.linkedIamUserId?.trim() || undefined,
      status: request.status ?? 'active',
      createdAt: this.now(),
      updatedAt: this.now()
    };
    this.state.learners.push(entity);
    this.audit(
      tenantId,
      actorId,
      'learning.learner_created',
      'learning.learner',
      entity.id,
      undefined,
      entity,
      context
    );
    return entity;
  }

  updateLearner(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    request: UpdateSimpleRegistryRequest,
    context: RequestContext
  ): Learner {
    const current = this.getById(this.state.learners, tenantId, id);
    const oldValues = { ...current };
    if (request.name) {
      const [firstName, lastName] = request.name.split(' ');
      current.firstName = firstName ?? request.name;
      current.lastName = lastName ?? '';
    }
    if (request.status) current.status = request.status;
    if (request.linkedIamUserId !== undefined && request.linkedIamUserId !== null) {
      current.linkedIamUserId = request.linkedIamUserId.trim() || undefined;
    } else if (request.linkedIamUserId === null) {
      current.linkedIamUserId = undefined;
    }
    current.updatedAt = this.now();
    this.audit(
      tenantId,
      actorId,
      'learning.learner_updated',
      'learning.learner',
      current.id,
      oldValues,
      current,
      context
    );
    return current;
  }

  listDirections(tenantId: string, query: BaseFilterQuery): ListResponse<Direction> {
    return this.list(this.state.directions, tenantId, query);
  }

  getDirection(tenantId: string, id: string): Direction {
    return this.getById(this.state.directions, tenantId, id);
  }

  lookupDirections(tenantId: string, query: BaseFilterQuery): ListResponse<LookupItem> {
    return this.lookup(this.state.directions, tenantId, query, (item) => item.name);
  }

  createDirection(
    tenantId: string,
    actorId: string | undefined,
    request: CreateSimpleRegistryRequest,
    context: RequestContext
  ): Direction {
    const entity: Direction = {
      id: this.id('direction'),
      tenantId,
      code: request.code,
      name: request.name,
      status: request.status ?? 'active',
      createdAt: this.now(),
      updatedAt: this.now()
    };
    this.state.directions.push(entity);
    this.audit(
      tenantId,
      actorId,
      'learning.direction_created',
      'learning.direction',
      entity.id,
      undefined,
      entity,
      context
    );
    return entity;
  }

  updateDirection(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    request: UpdateSimpleRegistryRequest,
    context: RequestContext
  ): Direction {
    const current = this.getById(this.state.directions, tenantId, id);
    const oldValues = { ...current };
    if (typeof request.code === 'string') current.code = request.code;
    if (typeof request.name === 'string') current.name = request.name;
    if (typeof request.status === 'string') current.status = request.status;
    current.updatedAt = this.now();
    this.audit(
      tenantId,
      actorId,
      'learning.direction_updated',
      'learning.direction',
      current.id,
      oldValues,
      current,
      context
    );
    return current;
  }

  listCourses(tenantId: string, query: BaseFilterQuery): ListResponse<Course> {
    return this.list(this.state.courses, tenantId, query);
  }
  getCourse(tenantId: string, id: string): Course {
    return this.getById(this.state.courses, tenantId, id);
  }
  lookupCourses(tenantId: string, query: BaseFilterQuery): ListResponse<LookupItem> {
    return this.lookup(this.state.courses, tenantId, query, (item) => item.title);
  }

  createCourse(
    tenantId: string,
    actorId: string | undefined,
    request: CreateCourseRequest,
    context: RequestContext
  ): Course {
    const entity: Course = {
      id: this.id('course'),
      tenantId,
      code: request.code,
      title: request.title,
      description: request.description,
      status: 'draft',
      isArchived: false,
      createdAt: this.now(),
      updatedAt: this.now()
    };
    this.state.courses.push(entity);
    this.audit(
      tenantId,
      actorId,
      'learning.course_created',
      'learning.course',
      entity.id,
      undefined,
      entity,
      context
    );
    return entity;
  }

  updateCourse(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    request: UpdateCourseRequest,
    context: RequestContext
  ): Course {
    const current = this.getById(this.state.courses, tenantId, id);
    if (current.status === 'archived') {
      throw new PreconditionFailedException({
        code: 'domain_rule_violation',
        message: 'Archived course is read-only'
      });
    }
    const oldValues = { ...current };
    if (typeof request.code === 'string') current.code = request.code;
    if (typeof request.title === 'string') current.title = request.title;
    if (typeof request.description === 'string' || request.description === null)
      current.description = request.description ?? undefined;
    if (typeof request.status === 'string') current.status = request.status;
    current.updatedAt = this.now();
    this.audit(
      tenantId,
      actorId,
      'learning.course_updated',
      'learning.course',
      current.id,
      oldValues,
      current,
      context
    );
    return current;
  }

  publishCourse(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    context: RequestContext
  ): Course {
    const course = this.getById(this.state.courses, tenantId, id);
    const versions = this.state.courseVersions.filter(
      (item) => item.tenantId === tenantId && item.courseId === id
    );
    if (versions.length === 0) {
      throw new PreconditionFailedException({
        code: 'precondition_failed',
        message: 'Course must have at least one version'
      });
    }
    course.status = 'published';
    course.updatedAt = this.now();
    this.audit(
      tenantId,
      actorId,
      'learning.course_published',
      'learning.course',
      course.id,
      undefined,
      course,
      context
    );
    return course;
  }

  archiveCourse(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    context: RequestContext
  ): Course {
    const course = this.getById(this.state.courses, tenantId, id);
    course.status = 'archived';
    course.isArchived = true;
    course.updatedAt = this.now();
    this.audit(
      tenantId,
      actorId,
      'learning.course_archived',
      'learning.course',
      course.id,
      undefined,
      course,
      context
    );
    return course;
  }

  listCourseVersions(tenantId: string, query: BaseFilterQuery): ListResponse<CourseVersion> {
    return this.list(this.state.courseVersions, tenantId, query);
  }
  getCourseVersion(tenantId: string, id: string): CourseVersion {
    return this.getById(this.state.courseVersions, tenantId, id);
  }
  createCourseVersion(tenantId: string, courseId: string): CourseVersion {
    this.getById(this.state.courses, tenantId, courseId);
    const versionNo =
      this.state.courseVersions.filter(
        (item) => item.courseId === courseId && item.tenantId === tenantId
      ).length + 1;
    const entity: CourseVersion = {
      id: this.id('cver'),
      tenantId,
      courseId,
      versionNo,
      status: 'draft',
      createdAt: this.now(),
      updatedAt: this.now()
    };
    this.state.courseVersions.push(entity);
    return entity;
  }

  listModules(tenantId: string, query: BaseFilterQuery): ListResponse<CourseModuleEntity> {
    return this.list(this.state.modules, tenantId, query);
  }
  getModule(tenantId: string, id: string): CourseModuleEntity {
    return this.getById(this.state.modules, tenantId, id);
  }
  createModule(
    tenantId: string,
    actorId: string | undefined,
    request: CreateModuleRequest,
    context: RequestContext
  ): CourseModuleEntity {
    if ((request.minViewSeconds ?? 0) < 0) {
      throw new BadRequestException({
        code: 'validation_error',
        message: 'min_view_seconds must be non-negative'
      });
    }
    this.getById(this.state.courseVersions, tenantId, request.courseVersionId);
    const entity: CourseModuleEntity = {
      id: this.id('module'),
      tenantId,
      courseVersionId: request.courseVersionId,
      title: request.title,
      sortOrder: this.state.modules.length,
      minViewSeconds: request.minViewSeconds ?? 0,
      isRequired: request.isRequired ?? true,
      status: 'active',
      createdAt: this.now(),
      updatedAt: this.now()
    };
    this.state.modules.push(entity);
    this.audit(
      tenantId,
      actorId,
      'learning.module_created',
      'learning.module',
      entity.id,
      undefined,
      entity,
      context
    );
    return entity;
  }
  updateModule(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    request: UpdateModuleRequest,
    context: RequestContext
  ): CourseModuleEntity {
    if (typeof request.minViewSeconds === 'number' && request.minViewSeconds < 0) {
      throw new BadRequestException({
        code: 'validation_error',
        message: 'min_view_seconds must be non-negative'
      });
    }
    const current = this.getById(this.state.modules, tenantId, id);
    const oldValues = { ...current };
    if (typeof request.title === 'string') current.title = request.title;
    if (typeof request.minViewSeconds === 'number') current.minViewSeconds = request.minViewSeconds;
    if (typeof request.isRequired === 'boolean') current.isRequired = request.isRequired;
    if (typeof request.status === 'string') current.status = request.status;
    current.updatedAt = this.now();
    this.audit(
      tenantId,
      actorId,
      'learning.module_updated',
      'learning.module',
      current.id,
      oldValues,
      current,
      context
    );
    return current;
  }

  listMaterials(tenantId: string, query: BaseFilterQuery): ListResponse<Material> {
    return this.list(this.state.materials, tenantId, query);
  }
  getMaterial(tenantId: string, id: string): Material {
    return this.getById(this.state.materials, tenantId, id);
  }
  createMaterial(
    tenantId: string,
    actorId: string | undefined,
    request: CreateMaterialRequest,
    context: RequestContext
  ): Material {
    if ((request.minViewSeconds ?? 0) < 0) {
      throw new BadRequestException({
        code: 'validation_error',
        message: 'min_view_seconds must be non-negative'
      });
    }
    this.getById(this.state.modules, tenantId, request.moduleId);
    const entity: Material = {
      id: this.id('material'),
      tenantId,
      moduleId: request.moduleId,
      title: request.title,
      materialType: request.materialType,
      sortOrder: this.state.materials.length,
      minViewSeconds: request.minViewSeconds ?? 0,
      isRequired: request.isRequired ?? true,
      fileId: request.fileId,
      status: 'active',
      createdAt: this.now(),
      updatedAt: this.now()
    };
    this.state.materials.push(entity);
    this.audit(
      tenantId,
      actorId,
      'learning.material_created',
      'learning.material',
      entity.id,
      undefined,
      entity,
      context
    );
    if (entity.fileId) {
      void this.filesService
        .ensureMaterialLink(tenantId, entity.id, entity.fileId)
        .catch(() => undefined);
    }
    return entity;
  }
  updateMaterial(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    request: UpdateMaterialRequest,
    context: RequestContext
  ): Material {
    if (typeof request.minViewSeconds === 'number' && request.minViewSeconds < 0) {
      throw new BadRequestException({
        code: 'validation_error',
        message: 'min_view_seconds must be non-negative'
      });
    }
    const current = this.getById(this.state.materials, tenantId, id);
    const oldValues = { ...current };
    if (typeof request.title === 'string') current.title = request.title;
    if (typeof request.minViewSeconds === 'number') current.minViewSeconds = request.minViewSeconds;
    if (typeof request.isRequired === 'boolean') current.isRequired = request.isRequired;
    if (typeof request.fileId === 'string' || request.fileId === null)
      current.fileId = request.fileId ?? undefined;
    if (typeof request.status === 'string') current.status = request.status;
    current.updatedAt = this.now();
    this.audit(
      tenantId,
      actorId,
      'learning.material_updated',
      'learning.material',
      current.id,
      oldValues,
      current,
      context
    );
    if (request.fileId !== undefined && current.fileId) {
      void this.filesService
        .ensureMaterialLink(tenantId, current.id, current.fileId)
        .catch(() => undefined);
    }
    return current;
  }

  listGroups(tenantId: string, query: BaseFilterQuery): ListResponse<GroupEntity> {
    return this.list(this.state.groups, tenantId, query);
  }
  getGroup(tenantId: string, id: string): GroupEntity {
    return this.getById(this.state.groups, tenantId, id);
  }
  lookupGroups(tenantId: string, query: BaseFilterQuery): ListResponse<LookupItem> {
    return this.lookup(this.state.groups, tenantId, query, (item) => item.name);
  }
  createGroup(
    tenantId: string,
    actorId: string | undefined,
    request: CreateSimpleRegistryRequest,
    context: RequestContext
  ): GroupEntity {
    const entity: GroupEntity = {
      id: this.id('group'),
      tenantId,
      code: request.code,
      name: request.name,
      status: request.status ?? 'draft',
      createdAt: this.now(),
      updatedAt: this.now()
    };
    this.state.groups.push(entity);
    this.audit(
      tenantId,
      actorId,
      'learning.group_created',
      'learning.group',
      entity.id,
      undefined,
      entity,
      context
    );
    return entity;
  }
  updateGroup(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    request: UpdateSimpleRegistryRequest,
    context: RequestContext
  ): GroupEntity {
    const current = this.getById(this.state.groups, tenantId, id);
    const oldValues = { ...current };
    if (typeof request.code === 'string') current.code = request.code;
    if (typeof request.name === 'string') current.name = request.name;
    if (typeof request.status === 'string') current.status = request.status;
    current.updatedAt = this.now();
    this.audit(
      tenantId,
      actorId,
      'learning.group_updated',
      'learning.group',
      current.id,
      oldValues,
      current,
      context
    );
    return current;
  }

  listGroupCourses(tenantId: string, query: BaseFilterQuery): ListResponse<GroupCourse> {
    return this.list(this.state.groupCourses, tenantId, query);
  }
  getGroupCourse(tenantId: string, id: string): GroupCourse {
    return this.getById(this.state.groupCourses, tenantId, id);
  }
  createGroupCourse(tenantId: string, request: CreateGroupCourseRequest): GroupCourse {
    this.getById(this.state.groups, tenantId, request.groupId);
    this.getById(this.state.courses, tenantId, request.courseId);
    const duplicate = this.state.groupCourses.some(
      (item) =>
        item.tenantId === tenantId &&
        item.groupId === request.groupId &&
        item.courseId === request.courseId
    );
    if (duplicate) {
      throw new ConflictException({
        code: 'conflict',
        message: 'Group course already exists for pair(group, course)'
      });
    }
    const entity: GroupCourse = {
      id: this.id('gc'),
      tenantId,
      groupId: request.groupId,
      courseId: request.courseId,
      sortOrder: this.state.groupCourses.length,
      status: 'active',
      createdAt: this.now(),
      updatedAt: this.now(),
      durationDays: this.normalizeDurationDays(request.durationDays)
    };
    this.state.groupCourses.push(entity);
    return entity;
  }

  updateGroupCourse(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    request: UpdateGroupCourseRequest,
    context: RequestContext
  ): GroupCourse {
    const current = this.getById(this.state.groupCourses, tenantId, id);
    const oldValues = { ...current };
    if (request.durationDays === null) {
      current.durationDays = undefined;
    } else if (typeof request.durationDays === 'number') {
      current.durationDays = this.normalizeDurationDays(request.durationDays);
    }
    current.updatedAt = this.now();
    this.audit(
      tenantId,
      actorId,
      'learning.group_course_updated',
      'learning.group_course',
      current.id,
      oldValues,
      current,
      context
    );
    return current;
  }

  listEnrollments(tenantId: string, query: BaseFilterQuery): ListResponse<Enrollment> {
    return this.list(this.state.enrollments, tenantId, query);
  }
  getEnrollment(tenantId: string, id: string): Enrollment {
    return this.getById(this.state.enrollments, tenantId, id);
  }

  createEnrollment(
    tenantId: string,
    actorId: string | undefined,
    request: CreateEnrollmentRequest,
    context: RequestContext
  ): Enrollment {
    this.getById(this.state.groups, tenantId, request.groupId);
    this.getById(this.state.learners, tenantId, request.learnerId);
    const duplicate = this.state.enrollments.some(
      (item) =>
        item.tenantId === tenantId &&
        item.groupId === request.groupId &&
        item.learnerId === request.learnerId
    );
    if (duplicate) {
      throw new ConflictException({
        code: 'conflict',
        message: 'Enrollment already exists for pair(group, learner)'
      });
    }
    const now = this.now();
    const entity: Enrollment = {
      id: this.id('enrollment'),
      tenantId,
      groupId: request.groupId,
      learnerId: request.learnerId,
      status: 'pending',
      enrolledAt: now,
      plannedEndAt: this.computePlannedEndAt(tenantId, request.groupId, now),
      createdAt: now,
      updatedAt: now
    };
    this.state.enrollments.push(entity);
    this.pushEnrollmentStatusHistory(tenantId, entity.id, entity.status, undefined);
    this.audit(
      tenantId,
      actorId,
      'learning.enrollment_created',
      'learning.enrollment',
      entity.id,
      undefined,
      entity,
      context
    );
    return entity;
  }

  changeEnrollmentStatus(
    tenantId: string,
    actorId: string | undefined,
    enrollmentId: string,
    request: UpdateEnrollmentStatusRequest,
    context: RequestContext
  ): Enrollment {
    const enrollment = this.getById(this.state.enrollments, tenantId, enrollmentId);
    const allowed = this.canTransitionEnrollment(enrollment.status, request.status);
    if (!allowed) {
      throw new PreconditionFailedException({
        code: 'domain_rule_violation',
        message: `Transition ${enrollment.status} -> ${request.status} is not allowed`
      });
    }
    const oldValues = { ...enrollment };
    enrollment.status = request.status;
    enrollment.updatedAt = this.now();
    enrollment.completedAt = request.status === 'completed' ? this.now() : enrollment.completedAt;
    this.pushEnrollmentStatusHistory(tenantId, enrollment.id, request.status, request.reason);
    this.audit(
      tenantId,
      actorId,
      'learning.enrollment_status_changed',
      'learning.enrollment',
      enrollment.id,
      oldValues,
      enrollment,
      context
    );
    if (request.status === 'completed') {
      const courseIds = this.state.groupCourses
        .filter((gc) => gc.tenantId === tenantId && gc.groupId === enrollment.groupId)
        .map((gc) => gc.courseId);
      this.events.emit(ENROLLMENT_COMPLETED_EVENT, {
        tenantId,
        enrollmentId: enrollment.id,
        learnerId: enrollment.learnerId,
        groupId: enrollment.groupId,
        groupCourseIds: courseIds,
        actorId
      });
    }
    return enrollment;
  }

  listProgress(tenantId: string, query: BaseFilterQuery): ListResponse<CourseProgress> {
    return this.list(this.state.courseProgress, tenantId, query);
  }

  getProgress(tenantId: string, id: string): CourseProgress {
    return this.getById(this.state.courseProgress, tenantId, id);
  }

  listEnrollmentStatusHistory(tenantId: string, enrollmentId: string): EnrollmentStatusHistory[] {
    return this.state.enrollmentStatusHistory.filter(
      (item) => item.tenantId === tenantId && item.enrollmentId === enrollmentId
    );
  }

  upsertMaterialProgress(
    tenantId: string,
    actorId: string | undefined,
    materialId: string,
    request: UpdateMaterialProgressRequest,
    context: RequestContext
  ): MaterialProgress {
    const material = this.getById(this.state.materials, tenantId, materialId);
    const moduleEntity = this.getById(this.state.modules, tenantId, material.moduleId);
    const courseVersion = this.getById(
      this.state.courseVersions,
      tenantId,
      moduleEntity.courseVersionId
    );

    const enrollment = this.state.enrollments.find(
      (item) => item.tenantId === tenantId && item.id === request.enrollmentId
    );
    if (!enrollment) {
      throw new NotFoundException({
        code: 'not_found',
        message: 'Enrollment not found for progress update'
      });
    }
    const hasGroupCourseAccess = this.state.groupCourses.some(
      (item) =>
        item.tenantId === tenantId &&
        item.groupId === enrollment.groupId &&
        item.courseId === courseVersion.courseId
    );
    if (!hasGroupCourseAccess) {
      throw new PreconditionFailedException({
        code: 'domain_rule_violation',
        message: 'Enrollment is not linked to the course for this material'
      });
    }

    this.assertActorMatchesLearnerIamLink(tenantId, actorId, enrollment.learnerId);

    if (request.studiedSeconds < 0) {
      throw new BadRequestException({
        code: 'validation_error',
        message: 'studied_seconds must be non-negative'
      });
    }

    const now = this.now();
    const requiredSeconds = material.minViewSeconds;
    const existing = this.state.materialProgress.find(
      (item) =>
        item.tenantId === tenantId &&
        item.materialId === materialId &&
        item.enrollmentId === enrollment.id
    );

    const studiedSeconds = Math.max(0, request.studiedSeconds);
    const ratio = requiredSeconds === 0 ? 1 : Math.min(1, studiedSeconds / requiredSeconds);
    const percent = this.normalizePercent(ratio * 100);
    const status: ProgressStatus =
      percent >= 100 ? 'completed' : percent > 0 ? 'in_progress' : 'not_started';

    const record: MaterialProgress = existing ?? {
      id: this.id('mp'),
      tenantId,
      enrollmentId: enrollment.id,
      courseId: courseVersion.courseId,
      moduleId: moduleEntity.id,
      materialId,
      status,
      studiedSeconds,
      requiredSeconds,
      progressPercent: percent,
      createdAt: now,
      updatedAt: now
    };

    record.studiedSeconds = studiedSeconds;
    record.requiredSeconds = requiredSeconds;
    record.progressPercent = percent;
    record.status = status;
    record.lastActivityAt = now;
    record.calculatedAt = now;
    record.updatedAt = now;
    record.completedAt = status === 'completed' ? now : undefined;

    if (!existing) this.state.materialProgress.push(record);

    this.recalculateModuleProgress(
      tenantId,
      enrollment.id,
      moduleEntity.id,
      courseVersion.courseId
    );
    this.recalculateCourseProgress(tenantId, enrollment.id, courseVersion.courseId);

    this.audit(
      tenantId,
      actorId,
      'learning.progress_updated',
      'learning.material_progress',
      record.id,
      undefined,
      record,
      context
    );
    return record;
  }

  private recalculateModuleProgress(
    tenantId: string,
    enrollmentId: string,
    moduleId: string,
    courseId: string
  ): void {
    const moduleMaterials = this.state.materialProgress.filter(
      (item) =>
        item.tenantId === tenantId &&
        item.enrollmentId === enrollmentId &&
        item.moduleId === moduleId
    );
    const requiredSeconds = moduleMaterials.reduce((acc, item) => acc + item.requiredSeconds, 0);
    const studiedSeconds = moduleMaterials.reduce((acc, item) => acc + item.studiedSeconds, 0);
    const ratio = requiredSeconds === 0 ? 1 : Math.min(1, studiedSeconds / requiredSeconds);
    const progressPercent = this.normalizePercent(ratio * 100);
    const status: ProgressStatus =
      progressPercent >= 100 ? 'completed' : progressPercent > 0 ? 'in_progress' : 'not_started';
    const now = this.now();
    const existing = this.state.moduleProgress.find(
      (item) =>
        item.tenantId === tenantId &&
        item.enrollmentId === enrollmentId &&
        item.moduleId === moduleId
    );
    const record: ModuleProgress = existing ?? {
      id: this.id('modp'),
      tenantId,
      enrollmentId,
      courseId,
      moduleId,
      status,
      progressPercent,
      studiedSeconds,
      requiredSeconds,
      createdAt: now,
      updatedAt: now
    };
    record.status = status;
    record.progressPercent = progressPercent;
    record.requiredSeconds = requiredSeconds;
    record.studiedSeconds = studiedSeconds;
    record.lastActivityAt = now;
    record.calculatedAt = now;
    record.updatedAt = now;
    record.completedAt = status === 'completed' ? now : undefined;
    if (!existing) this.state.moduleProgress.push(record);
  }

  private recalculateCourseProgress(
    tenantId: string,
    enrollmentId: string,
    courseId: string
  ): void {
    const moduleProgress = this.state.moduleProgress.filter(
      (item) =>
        item.tenantId === tenantId &&
        item.enrollmentId === enrollmentId &&
        item.courseId === courseId
    );
    const requiredSeconds = moduleProgress.reduce((acc, item) => acc + item.requiredSeconds, 0);
    const studiedSeconds = moduleProgress.reduce((acc, item) => acc + item.studiedSeconds, 0);
    const ratio = requiredSeconds === 0 ? 1 : Math.min(1, studiedSeconds / requiredSeconds);
    const progressPercent = this.normalizePercent(ratio * 100);
    const status: ProgressStatus =
      progressPercent >= 100 ? 'completed' : progressPercent > 0 ? 'in_progress' : 'not_started';
    const now = this.now();
    const existing = this.state.courseProgress.find(
      (item) =>
        item.tenantId === tenantId &&
        item.enrollmentId === enrollmentId &&
        item.courseId === courseId
    );
    const record: CourseProgress = existing ?? {
      id: this.id('cpg'),
      tenantId,
      enrollmentId,
      courseId,
      status,
      progressPercent,
      studiedSeconds,
      requiredSeconds,
      createdAt: now,
      updatedAt: now
    };
    record.status = status;
    record.progressPercent = progressPercent;
    record.requiredSeconds = requiredSeconds;
    record.studiedSeconds = studiedSeconds;
    record.lastActivityAt = now;
    record.calculatedAt = now;
    record.updatedAt = now;
    record.completedAt = status === 'completed' ? now : undefined;
    if (!existing) this.state.courseProgress.push(record);
  }

  listQuestionBanks(tenantId: string, query: BaseFilterQuery): ListResponse<QuestionBank> {
    return this.list(this.state.questionBanks, tenantId, query);
  }
  getQuestionBank(tenantId: string, id: string): QuestionBank {
    return this.getById(this.state.questionBanks, tenantId, id);
  }
  createQuestionBank(
    tenantId: string,
    actorId: string | undefined,
    request: CreateQuestionBankRequest,
    context: RequestContext
  ): QuestionBank {
    const entity: QuestionBank = {
      id: this.id('qbank'),
      tenantId,
      code: request.code,
      title: request.title,
      description: request.description,
      isArchived: false,
      status: 'draft',
      createdAt: this.now(),
      updatedAt: this.now()
    };
    this.state.questionBanks.push(entity);
    this.audit(
      tenantId,
      actorId,
      'assessment.question_bank_created',
      'assessment.question_bank',
      entity.id,
      undefined,
      entity,
      context
    );
    return entity;
  }
  updateQuestionBank(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    request: UpdateQuestionBankRequest,
    context: RequestContext
  ): QuestionBank {
    const current = this.getById(this.state.questionBanks, tenantId, id);
    const oldValues = { ...current };
    Object.assign(current, request, { updatedAt: this.now() });
    this.audit(
      tenantId,
      actorId,
      'assessment.question_bank_updated',
      'assessment.question_bank',
      current.id,
      oldValues,
      current,
      context
    );
    return current;
  }
  archiveQuestionBank(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    context: RequestContext
  ): QuestionBank {
    const current = this.getById(this.state.questionBanks, tenantId, id);
    current.status = 'archived';
    current.isArchived = true;
    current.updatedAt = this.now();
    this.audit(
      tenantId,
      actorId,
      'assessment.question_bank_archived',
      'assessment.question_bank',
      current.id,
      undefined,
      current,
      context
    );
    return current;
  }

  listQuestions(tenantId: string, query: BaseFilterQuery): ListResponse<Question> {
    return this.list(this.state.questions, tenantId, query);
  }
  getQuestion(tenantId: string, id: string): Question {
    return this.getById(this.state.questions, tenantId, id);
  }
  listQuestionBankQuestions(
    tenantId: string,
    questionBankId: string,
    query: BaseFilterQuery
  ): ListResponse<Question> {
    this.getById(this.state.questionBanks, tenantId, questionBankId);
    return this.list(
      this.state.questions.filter((item) => item.questionBankId === questionBankId),
      tenantId,
      query
    );
  }
  createQuestion(
    tenantId: string,
    actorId: string | undefined,
    request: CreateQuestionRequest,
    context: RequestContext
  ): Question {
    this.getById(this.state.questionBanks, tenantId, request.questionBankId);
    const title =
      (request as unknown as { title?: string; text?: string }).title ??
      (request as unknown as { text?: string }).text ??
      '';
    const body =
      (request as unknown as { body?: string; text?: string }).body ??
      (request as unknown as { text?: string }).text;
    const score = (request as unknown as { score?: number }).score ?? 1;
    const entity: Question = {
      id: this.id('q'),
      tenantId,
      questionBankId: request.questionBankId,
      type: request.type,
      title,
      body,
      score,
      isArchived: false,
      status: 'active',
      createdAt: this.now(),
      updatedAt: this.now()
    };
    this.state.questions.push(entity);
    const options =
      (
        request as unknown as {
          answerOptions?: Array<{ text: string; isCorrect?: boolean }>;
          options?: Array<{ text: string; isCorrect?: boolean }>;
        }
      ).answerOptions ??
      (request as unknown as { options?: Array<{ text: string; isCorrect?: boolean }> }).options;
    if (options?.length) {
      options.forEach((option, idx) =>
        this.state.answerOptions.push({
          id: this.id('opt'),
          tenantId,
          questionId: entity.id,
          text: option.text,
          isCorrect: Boolean(option.isCorrect),
          sortOrder: idx,
          status: 'active',
          createdAt: this.now(),
          updatedAt: this.now()
        })
      );
    }
    this.audit(
      tenantId,
      actorId,
      'assessment.question_created',
      'assessment.question',
      entity.id,
      undefined,
      entity,
      context
    );
    return entity;
  }
  updateQuestion(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    request: UpdateQuestionRequest,
    context: RequestContext
  ): Question {
    const current = this.getById(this.state.questions, tenantId, id);
    if (current.isArchived)
      throw new PreconditionFailedException({
        code: 'domain_rule_violation',
        message: 'Archived question is read-only'
      });
    const oldValues = { ...current };
    Object.assign(current, request, { updatedAt: this.now() });
    const answerOptions =
      (
        request as unknown as {
          answerOptions?: Array<{ text: string; isCorrect?: boolean }>;
          options?: Array<{ text: string; isCorrect?: boolean }>;
        }
      ).answerOptions ??
      (request as unknown as { options?: Array<{ text: string; isCorrect?: boolean }> }).options;
    if (answerOptions) {
      this.state.answerOptions = this.state.answerOptions.filter(
        (item) => !(item.tenantId === tenantId && item.questionId === id)
      );
      answerOptions.forEach((option, idx) =>
        this.state.answerOptions.push({
          id: this.id('opt'),
          tenantId,
          questionId: id,
          text: option.text,
          isCorrect: Boolean(option.isCorrect),
          sortOrder: idx,
          status: 'active',
          createdAt: this.now(),
          updatedAt: this.now()
        })
      );
    }
    this.audit(
      tenantId,
      actorId,
      'assessment.question_updated',
      'assessment.question',
      current.id,
      oldValues,
      current,
      context
    );
    return current;
  }
  archiveQuestion(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    context: RequestContext
  ): Question {
    const current = this.getById(this.state.questions, tenantId, id);
    current.status = 'archived';
    current.isArchived = true;
    current.updatedAt = this.now();
    this.audit(
      tenantId,
      actorId,
      'assessment.question_archived',
      'assessment.question',
      current.id,
      undefined,
      current,
      context
    );
    return current;
  }

  listTests(tenantId: string, query: BaseFilterQuery): ListResponse<TestEntity> {
    return this.list(this.state.tests, tenantId, query);
  }
  getTest(tenantId: string, id: string): TestEntity {
    return this.getById(this.state.tests, tenantId, id);
  }
  createTest(
    tenantId: string,
    actorId: string | undefined,
    request: CreateTestRequest,
    context: RequestContext
  ): TestEntity {
    this.getById(this.state.courses, tenantId, request.courseId);
    const entity: TestEntity = {
      id: this.id('test'),
      tenantId,
      courseId: request.courseId,
      title: request.title,
      description: request.description,
      questionBankId: request.questionBankId,
      rules: this.normalizeTestRules(request.rules),
      isArchived: false,
      status: 'draft',
      createdAt: this.now(),
      updatedAt: this.now()
    };
    this.state.tests.push(entity);
    this.audit(
      tenantId,
      actorId,
      'assessment.test_created',
      'assessment.test',
      entity.id,
      undefined,
      entity,
      context
    );
    return entity;
  }
  updateTest(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    request: UpdateTestRequest,
    context: RequestContext
  ): TestEntity {
    const current = this.getById(this.state.tests, tenantId, id);
    const oldValues = { ...current };
    Object.assign(current, request, { updatedAt: this.now() });
    this.audit(
      tenantId,
      actorId,
      'assessment.test_updated',
      'assessment.test',
      current.id,
      oldValues,
      current,
      context
    );
    return current;
  }
  publishTest(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    context: RequestContext
  ): TestEntity {
    const current = this.getById(this.state.tests, tenantId, id);
    current.status = 'published';
    current.updatedAt = this.now();
    this.audit(
      tenantId,
      actorId,
      'assessment.test_published',
      'assessment.test',
      current.id,
      undefined,
      current,
      context
    );
    return current;
  }
  archiveTest(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    context: RequestContext
  ): TestEntity {
    const current = this.getById(this.state.tests, tenantId, id);
    current.status = 'archived';
    current.isArchived = true;
    current.updatedAt = this.now();
    this.audit(
      tenantId,
      actorId,
      'assessment.test_archived',
      'assessment.test',
      current.id,
      undefined,
      current,
      context
    );
    return current;
  }
  patchTestRules(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    request: PatchTestRulesRequest,
    context: RequestContext
  ): TestEntity {
    const current = this.getById(this.state.tests, tenantId, id);
    current.rules = this.normalizeTestRules(request);
    current.updatedAt = this.now();
    this.audit(
      tenantId,
      actorId,
      'assessment.test_rules_updated',
      'assessment.test',
      current.id,
      undefined,
      current,
      context
    );
    return current;
  }
  listTestQuestions(tenantId: string, testId: string): TestQuestion[] {
    this.getById(this.state.tests, tenantId, testId);
    return this.state.testQuestions.filter(
      (item) => item.tenantId === tenantId && item.testId === testId
    );
  }
  addTestQuestions(
    tenantId: string,
    actorIdOrTestId: string | undefined,
    testIdOrQuestionIds: string | string[],
    questionIdsOrContext?: string[] | RequestContext,
    maybeContext?: RequestContext
  ): TestQuestion[] {
    let actorId: string | undefined;
    let testId: string;
    let questionIds: string[];
    let context: RequestContext | undefined;

    if (Array.isArray(testIdOrQuestionIds)) {
      actorId = undefined;
      testId = actorIdOrTestId ?? '';
      questionIds = testIdOrQuestionIds;
      context = undefined;
    } else {
      actorId = actorIdOrTestId;
      testId = testIdOrQuestionIds;
      questionIds = Array.isArray(questionIdsOrContext) ? questionIdsOrContext : [];
      context = Array.isArray(questionIdsOrContext) ? maybeContext : questionIdsOrContext;
    }

    this.getById(this.state.tests, tenantId, testId);
    questionIds.forEach((questionId) => this.getById(this.state.questions, tenantId, questionId));
    questionIds.forEach((questionId) => {
      if (
        !this.state.testQuestions.some(
          (item) =>
            item.tenantId === tenantId && item.testId === testId && item.questionId === questionId
        )
      ) {
        this.state.testQuestions.push({
          id: this.id('tq'),
          tenantId,
          testId,
          questionId,
          sortOrder: this.state.testQuestions.length,
          status: 'active',
          createdAt: this.now(),
          updatedAt: this.now()
        });
      }
    });
    if (context) {
      this.audit(
        tenantId,
        actorId,
        'assessment.test_questions_attached',
        'assessment.test',
        testId,
        undefined,
        { testId, questionIds },
        context
      );
    }
    return this.listTestQuestions(tenantId, testId);
  }

  listAttempts(
    tenantId: string,
    query: BaseFilterQuery,
    access?: MvpAssessmentReadAccess
  ): ListResponse<TestAttempt> {
    const scope = this.restrictLearnerIdsForAssessmentList(tenantId, access);
    const source =
      scope === null
        ? this.state.attempts
        : this.state.attempts.filter((a) => a.tenantId === tenantId && scope.includes(a.learnerId));
    return this.list(source, tenantId, query);
  }
  getAttempt(tenantId: string, id: string, access?: MvpAssessmentReadAccess): TestAttempt {
    const attempt = this.getById(this.state.attempts, tenantId, id);
    this.assertAssessmentReadAllowedForLearner(tenantId, attempt.learnerId, access);
    return attempt;
  }
  startAttempt(
    tenantId: string,
    actorId: string | undefined,
    request: StartAttemptRequest,
    context: RequestContext
  ): TestAttempt {
    const test = this.getById(this.state.tests, tenantId, request.testId);
    const enrollment = this.getById(this.state.enrollments, tenantId, request.enrollmentId);
    const hasGroupCourseAccess = this.state.groupCourses.some(
      (item) =>
        item.tenantId === tenantId &&
        item.groupId === enrollment.groupId &&
        item.courseId === test.courseId
    );
    if (!hasGroupCourseAccess) {
      throw new PreconditionFailedException({
        code: 'domain_rule_violation',
        message: 'Enrollment is not linked to the test course'
      });
    }
    const claimedLearner = request.learnerId?.trim();
    if (!claimedLearner) {
      throw new BadRequestException({ code: 'validation_error', message: 'learnerId is required' });
    }
    this.ensureClaimedLearnerMatchesEnrollment(enrollment.learnerId, claimedLearner);
    this.assertActorMatchesLearnerIamLink(tenantId, actorId, enrollment.learnerId);

    const learnerId = enrollment.learnerId;
    const now = new Date(this.now());
    const dayKey = now.toISOString().slice(0, 10);
    const attempts = this.state.attempts.filter(
      (item) =>
        item.tenantId === tenantId && item.testId === request.testId && item.learnerId === learnerId
    );
    const bounded = test.rules.dailyResetEnabled
      ? attempts.filter((item) => item.startedAt.slice(0, 10) === dayKey)
      : attempts;
    if (bounded.length >= test.rules.attemptLimit)
      throw new PreconditionFailedException({
        code: 'attempt_limit_reached',
        message: 'Attempt limit reached'
      });
    const questionPool = this.listTestQuestions(tenantId, request.testId).map(
      (item) => item.questionId
    );
    const ordered = [...questionPool];
    if (test.rules.randomizeQuestions) ordered.sort(() => Math.random() - 0.5);
    const snapshot = test.rules.questionCount
      ? ordered.slice(0, test.rules.questionCount)
      : ordered;
    const maxScore = snapshot.reduce(
      (acc, questionId) => acc + this.getById(this.state.questions, tenantId, questionId).score,
      0
    );
    const startedAt = now.toISOString();
    const expiresAt = test.rules.timeLimitMinutes
      ? new Date(now.getTime() + test.rules.timeLimitMinutes * 60000).toISOString()
      : undefined;
    const entity: TestAttempt = {
      id: this.id('attempt'),
      tenantId,
      testId: request.testId,
      enrollmentId: request.enrollmentId,
      learnerId,
      attemptNo: attempts.length + 1,
      status: 'in_progress',
      startedAt,
      expiresAt,
      score: 0,
      maxScore,
      questionOrder: snapshot,
      createdAt: startedAt,
      updatedAt: startedAt
    };
    this.state.attempts.push(entity);
    this.audit(
      tenantId,
      actorId,
      'assessment.attempt_started',
      'assessment.test_attempt',
      entity.id,
      undefined,
      entity,
      context
    );
    return entity;
  }
  saveAnswer(
    tenantId: string,
    actorId: string | undefined,
    attemptId: string,
    request: SaveAttemptAnswerRequest,
    context: RequestContext
  ): AttemptAnswer {
    const attempt = this.getById(this.state.attempts, tenantId, attemptId);
    this.assertActorMatchesLearnerIamLink(tenantId, actorId, attempt.learnerId);

    if (!['draft', 'in_progress'].includes(attempt.status))
      throw new PreconditionFailedException({
        code: 'attempt_terminal',
        message: 'Cannot update answers in terminal state'
      });
    if (attempt.expiresAt && new Date(attempt.expiresAt) <= new Date()) {
      attempt.status = 'expired';
      throw new PreconditionFailedException({
        code: 'attempt_expired',
        message: 'Attempt expired'
      });
    }
    if (!attempt.questionOrder.includes(request.questionId))
      throw new BadRequestException({
        code: 'domain_rule_violation',
        message: 'Question is not part of attempt snapshot'
      });
    const existing = this.state.attemptAnswers.find(
      (item) =>
        item.tenantId === tenantId &&
        item.attemptId === attemptId &&
        item.questionId === request.questionId
    );
    const answer = existing ?? {
      id: this.id('ans'),
      tenantId,
      attemptId,
      questionId: request.questionId,
      status: 'active',
      createdAt: this.now(),
      updatedAt: this.now()
    };
    answer.selectedOptionIds = request.selectedOptionIds;
    answer.textAnswer = request.textAnswer;
    answer.updatedAt = this.now();
    if (!existing) this.state.attemptAnswers.push(answer);
    this.audit(
      tenantId,
      actorId,
      'assessment.answer_saved',
      'assessment.attempt_answer',
      answer.id,
      undefined,
      answer,
      context
    );
    return answer;
  }
  saveAttemptAnswer(
    tenantId: string,
    actorId: string | undefined,
    attemptId: string,
    request: SaveAnswerRequest,
    context: RequestContext
  ): AttemptAnswer {
    return this.saveAnswer(
      tenantId,
      actorId,
      attemptId,
      {
        questionId: request.questionId,
        selectedOptionIds: request.selectedOptionIds ?? request.answerOptionIds,
        textAnswer: request.textAnswer
      },
      context
    );
  }
  createAnswer(
    tenantId: string,
    actorId: string | undefined,
    request: { attemptId: string } & SaveAnswerRequest,
    context: RequestContext
  ): AttemptAnswer {
    return this.saveAttemptAnswer(tenantId, actorId, request.attemptId, request, context);
  }
  patchAnswer(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    request: SaveAnswerRequest,
    context: RequestContext
  ): AttemptAnswer {
    const answer = this.getById(this.state.attemptAnswers, tenantId, id);
    return this.saveAttemptAnswer(tenantId, actorId, answer.attemptId, request, context);
  }
  submitAttempt(
    tenantId: string,
    actorId: string | undefined,
    attemptId: string,
    context: RequestContext
  ): TestAttempt {
    const attempt = this.getById(this.state.attempts, tenantId, attemptId);
    this.assertActorMatchesLearnerIamLink(tenantId, actorId, attempt.learnerId);

    if (['submitted', 'finished', 'expired', 'invalidated'].includes(attempt.status))
      return attempt;
    if (attempt.expiresAt && new Date(attempt.expiresAt) <= new Date()) attempt.status = 'expired';
    const test = this.getById(this.state.tests, tenantId, attempt.testId);
    const answers = this.state.attemptAnswers.filter(
      (item) => item.tenantId === tenantId && item.attemptId === attempt.id
    );
    let score = 0;
    for (const qid of attempt.questionOrder) {
      const question = this.getById(this.state.questions, tenantId, qid);
      const answer = answers.find((item) => item.questionId === qid);
      if (!answer) continue;
      if (question.type === 'text') continue;
      const correct = this.state.answerOptions
        .filter((item) => item.tenantId === tenantId && item.questionId === qid && item.isCorrect)
        .map((item) => item.id)
        .sort();
      const selected = [...(answer.selectedOptionIds ?? answer.answerOptionIds ?? [])].sort();
      if (JSON.stringify(correct) === JSON.stringify(selected)) score += question.score;
    }
    attempt.score = score;
    attempt.passed = score >= test.rules.passingScore;
    attempt.status = 'submitted';
    attempt.submittedAt = this.now();
    attempt.updatedAt = this.now();
    this.finalizeExamResult(tenantId, actorId, attempt, context);
    this.audit(
      tenantId,
      actorId,
      'assessment.attempt_submitted',
      'assessment.test_attempt',
      attempt.id,
      undefined,
      attempt,
      context
    );
    return attempt;
  }
  finishAttempt(
    tenantId: string,
    actorId: string | undefined,
    attemptId: string,
    context: RequestContext
  ): TestAttempt {
    const submitted = this.submitAttempt(tenantId, actorId, attemptId, context);
    submitted.status = 'finished';
    submitted.finishedAt = this.now();
    submitted.updatedAt = this.now();
    this.audit(
      tenantId,
      actorId,
      'assessment.attempt_finished',
      'assessment.test_attempt',
      submitted.id,
      undefined,
      submitted,
      context
    );
    return submitted;
  }

  listExamResults(
    tenantId: string,
    query: BaseFilterQuery,
    access?: MvpAssessmentReadAccess
  ): ListResponse<ExamResult> {
    const scope = this.restrictLearnerIdsForAssessmentList(tenantId, access);
    const source =
      scope === null
        ? this.state.examResults
        : this.state.examResults.filter(
            (r) => r.tenantId === tenantId && scope.includes(r.learnerId)
          );
    return this.list(source, tenantId, query);
  }
  getExamResult(tenantId: string, id: string, access?: MvpAssessmentReadAccess): ExamResult {
    const result = this.getById(this.state.examResults, tenantId, id);
    this.assertAssessmentReadAllowedForLearner(tenantId, result.learnerId, access);
    return result;
  }
  getExamResultByEnrollment(
    tenantId: string,
    enrollmentId: string,
    access?: MvpAssessmentReadAccess
  ): ExamResult[] {
    const enrollment = this.getById(this.state.enrollments, tenantId, enrollmentId);
    this.assertAssessmentReadAllowedForLearner(tenantId, enrollment.learnerId, access);
    return this.state.examResults.filter(
      (item) => item.tenantId === tenantId && item.enrollmentId === enrollmentId
    );
  }
  getAttemptResult(tenantId: string, id: string, access?: MvpAssessmentReadAccess): ExamResult {
    const attempt = this.getById(this.state.attempts, tenantId, id);
    this.assertAssessmentReadAllowedForLearner(tenantId, attempt.learnerId, access);
    return this.recalculateExamResult(
      tenantId,
      attempt.testId,
      attempt.enrollmentId,
      attempt.learnerId
    );
  }
  recalculateExamResults(tenantId: string): { count: number } {
    const grouped = new Set<string>();
    this.state.attempts
      .filter((item) => item.tenantId === tenantId)
      .forEach((item) => grouped.add(`${item.testId}:${item.enrollmentId}:${item.learnerId}`));

    for (const key of grouped) {
      const [testId, enrollmentId, learnerId] = key.split(':');
      if (!testId || !enrollmentId || !learnerId) {
        continue;
      }
      this.recalculateExamResult(tenantId, testId, enrollmentId, learnerId);
    }

    return { count: grouped.size };
  }
  private finalizeExamResult(
    tenantId: string,
    actorId: string | undefined,
    attempt: TestAttempt,
    context: RequestContext
  ): void {
    const existing = this.state.examResults.find(
      (item) =>
        item.tenantId === tenantId &&
        item.enrollmentId === attempt.enrollmentId &&
        item.testId === attempt.testId
    );
    const attempts = this.state.attempts.filter(
      (item) =>
        item.tenantId === tenantId &&
        item.enrollmentId === attempt.enrollmentId &&
        item.testId === attempt.testId &&
        ['submitted', 'finished'].includes(item.status)
    );
    const best = attempts.sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0] ?? attempt;
    const test = this.getById(this.state.tests, tenantId, attempt.testId);
    if (existing) {
      existing.bestAttemptId = best.id;
      existing.attemptsCount = attempts.length;
      existing.finalScore = best.score ?? 0;
      existing.maxScore = best.maxScore;
      existing.passed = (best.score ?? 0) >= test.rules.passingScore;
      existing.updatedAt = this.now();
      this.audit(
        tenantId,
        actorId,
        'assessment.exam_result_finalized',
        'assessment.exam_result',
        existing.id,
        undefined,
        existing,
        context
      );
      return;
    }
    const entity: ExamResult = {
      id: this.id('result'),
      tenantId,
      enrollmentId: attempt.enrollmentId,
      learnerId: attempt.learnerId,
      testId: attempt.testId,
      bestAttemptId: best.id,
      attemptsCount: attempts.length,
      finalScore: best.score ?? 0,
      maxScore: best.maxScore,
      passed: (best.score ?? 0) >= test.rules.passingScore,
      status: 'final',
      createdAt: this.now(),
      updatedAt: this.now()
    };
    this.state.examResults.push(entity);
    this.audit(
      tenantId,
      actorId,
      'assessment.exam_result_finalized',
      'assessment.exam_result',
      entity.id,
      undefined,
      entity,
      context
    );
  }

  listAssignments(tenantId: string, query: BaseFilterQuery): ListResponse<Assignment> {
    return this.list(this.state.assignments, tenantId, query);
  }
  getAssignment(tenantId: string, id: string): Assignment {
    return this.getById(this.state.assignments, tenantId, id);
  }
  createAssignment(
    tenantId: string,
    actorId: string | undefined,
    request: CreateAssignmentRequest,
    context: RequestContext
  ): Assignment {
    const entity: Assignment = {
      id: this.id('asn'),
      tenantId,
      courseId: request.courseId,
      moduleId: request.moduleId,
      title: request.title,
      description: request.description,
      maxScore: request.maxScore ?? 0,
      isReviewRequired: request.isReviewRequired ?? true,
      isArchived: false,
      status: 'draft',
      createdAt: this.now(),
      updatedAt: this.now()
    };
    this.state.assignments.push(entity);
    this.audit(
      tenantId,
      actorId,
      'assessment.assignment_created',
      'assessment.assignment',
      entity.id,
      undefined,
      entity,
      context
    );
    return entity;
  }
  updateAssignment(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    request: UpdateAssignmentRequest,
    context: RequestContext
  ): Assignment {
    const current = this.getById(this.state.assignments, tenantId, id);
    const oldValues = { ...current };
    Object.assign(current, request, { updatedAt: this.now() });
    this.audit(
      tenantId,
      actorId,
      'assessment.assignment_updated',
      'assessment.assignment',
      current.id,
      oldValues,
      current,
      context
    );
    return current;
  }
  publishAssignment(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    _context: RequestContext
  ): Assignment {
    const current = this.getById(this.state.assignments, tenantId, id);
    current.status = 'published';
    current.updatedAt = this.now();
    return current;
  }
  archiveAssignment(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    _context: RequestContext
  ): Assignment {
    const current = this.getById(this.state.assignments, tenantId, id);
    current.status = 'archived';
    current.isArchived = true;
    current.updatedAt = this.now();
    return current;
  }
  listAssignmentSubmissions(
    tenantId: string,
    query: BaseFilterQuery,
    access?: MvpAssessmentReadAccess
  ): ListResponse<AssignmentSubmission> {
    const scope = this.restrictLearnerIdsForAssessmentList(tenantId, access);
    const source =
      scope === null
        ? this.state.assignmentSubmissions
        : this.state.assignmentSubmissions.filter(
            (s) => s.tenantId === tenantId && scope.includes(s.learnerId)
          );
    return this.list(source, tenantId, query);
  }
  getAssignmentSubmission(
    tenantId: string,
    id: string,
    access?: MvpAssessmentReadAccess
  ): AssignmentSubmission {
    const submission = this.getById(this.state.assignmentSubmissions, tenantId, id);
    this.assertAssessmentReadAllowedForLearner(tenantId, submission.learnerId, access);
    return submission;
  }
  createAssignmentSubmission(
    tenantId: string,
    actorId: string | undefined,
    request: CreateAssignmentSubmissionRequest,
    _context: RequestContext
  ): AssignmentSubmission {
    const claimedLearner = request.learnerId?.trim();
    if (!claimedLearner) {
      throw new BadRequestException({ code: 'validation_error', message: 'learnerId is required' });
    }
    const assignment = this.getById(this.state.assignments, tenantId, request.assignmentId);
    const enrollment = this.getById(this.state.enrollments, tenantId, request.enrollmentId);
    const hasGroupCourseAccess = this.state.groupCourses.some(
      (item) =>
        item.tenantId === tenantId &&
        item.groupId === enrollment.groupId &&
        item.courseId === assignment.courseId
    );
    if (!hasGroupCourseAccess) {
      throw new PreconditionFailedException({
        code: 'domain_rule_violation',
        message: 'Enrollment is not linked to the assignment course'
      });
    }
    this.ensureClaimedLearnerMatchesEnrollment(enrollment.learnerId, claimedLearner);
    this.assertActorMatchesLearnerIamLink(tenantId, actorId, enrollment.learnerId);

    const submission: AssignmentSubmission = {
      id: this.id('subm'),
      tenantId,
      assignmentId: request.assignmentId,
      enrollmentId: request.enrollmentId,
      learnerId: enrollment.learnerId,
      answerText: request.answerText,
      fileId: request.fileId,
      status: 'draft',
      createdAt: this.now(),
      updatedAt: this.now()
    };
    this.state.assignmentSubmissions.push(submission);
    return submission;
  }
  updateAssignmentSubmission(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    request: UpdateAssignmentSubmissionRequest,
    _context: RequestContext
  ): AssignmentSubmission {
    const current = this.getById(this.state.assignmentSubmissions, tenantId, id);
    const enrollment = this.getById(this.state.enrollments, tenantId, current.enrollmentId);
    this.assertActorMatchesLearnerIamLink(tenantId, actorId, enrollment.learnerId);

    if (['submitted', 'under_review', 'reviewed', 'rejected'].includes(current.status))
      throw new PreconditionFailedException({
        code: 'submission_terminal',
        message: 'Submission is not editable'
      });
    Object.assign(current, request, { updatedAt: this.now() });
    return current;
  }
  submitAssignmentSubmission(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    context: RequestContext
  ): AssignmentSubmission {
    const current = this.getById(this.state.assignmentSubmissions, tenantId, id);
    const enrollment = this.getById(this.state.enrollments, tenantId, current.enrollmentId);
    this.assertActorMatchesLearnerIamLink(tenantId, actorId, enrollment.learnerId);

    if (['submitted', 'under_review', 'reviewed'].includes(current.status)) return current;
    current.status = 'submitted';
    current.submittedAt = this.now();
    current.updatedAt = this.now();
    this.audit(
      tenantId,
      actorId,
      'assessment.assignment_submission_submitted',
      'assessment.assignment_submission',
      current.id,
      undefined,
      current,
      context
    );
    return current;
  }
  listAssignmentReviews(tenantId: string, query: BaseFilterQuery): ListResponse<AssignmentReview> {
    return this.list(this.state.assignmentReviews, tenantId, query);
  }
  getAssignmentReview(tenantId: string, id: string): AssignmentReview {
    return this.getById(this.state.assignmentReviews, tenantId, id);
  }
  createAssignmentReview(
    tenantId: string,
    actorId: string | undefined,
    request: CreateAssignmentReviewRequest,
    _context: RequestContext
  ): AssignmentReview {
    const submission = this.getById(
      this.state.assignmentSubmissions,
      tenantId,
      request.submissionId
    );
    if (!['submitted', 'under_review'].includes(submission.status)) {
      throw new PreconditionFailedException({
        code: 'domain_rule_violation',
        message: 'Submission must be submitted before review'
      });
    }
    const existingReview = this.state.assignmentReviews.find(
      (item) => item.tenantId === tenantId && item.submissionId === submission.id
    );
    if (existingReview) {
      throw new ConflictException({
        code: 'conflict',
        message: 'Assignment review already exists for submission'
      });
    }
    this.validateAssignmentReviewScore(tenantId, submission.assignmentId, request.score);
    submission.status = 'under_review';
    const review: AssignmentReview = {
      id: this.id('rev'),
      tenantId,
      assignmentId: submission.assignmentId,
      submissionId: submission.id,
      enrollmentId: submission.enrollmentId,
      reviewerId: actorId ?? 'unknown',
      score: request.score,
      comment: request.comment,
      status: 'in_review',
      createdAt: this.now(),
      updatedAt: this.now()
    };
    this.state.assignmentReviews.push(review);
    return review;
  }
  updateAssignmentReview(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    request: UpdateAssignmentReviewRequest,
    context: RequestContext
  ): AssignmentReview {
    const review = this.getById(this.state.assignmentReviews, tenantId, id);
    if (review.status === 'completed') {
      throw new PreconditionFailedException({
        code: 'domain_rule_violation',
        message: 'Completed review is read-only'
      });
    }
    this.validateAssignmentReviewScore(tenantId, review.assignmentId, request.score);
    const oldValues = { ...review };
    if (request.score !== undefined) review.score = request.score;
    if (request.comment !== undefined) review.comment = request.comment;
    review.updatedAt = this.now();
    this.audit(
      tenantId,
      actorId,
      'assessment.assignment_review_updated',
      'assessment.assignment_review',
      review.id,
      oldValues,
      review,
      context
    );
    return review;
  }
  completeAssignmentReview(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    request: { score?: number; comment?: string },
    context: RequestContext
  ): AssignmentReview {
    const review = this.getById(this.state.assignmentReviews, tenantId, id);
    if (review.status === 'completed') {
      throw new PreconditionFailedException({
        code: 'domain_rule_violation',
        message: 'Review is already completed'
      });
    }
    if (review.status !== 'in_review') {
      throw new PreconditionFailedException({
        code: 'domain_rule_violation',
        message: 'Only in_review assignment review can be completed'
      });
    }
    this.validateAssignmentReviewScore(tenantId, review.assignmentId, request.score);
    review.score = request.score ?? review.score;
    review.comment = request.comment ?? review.comment;
    review.status = 'completed';
    review.completedAt = this.now();
    review.updatedAt = this.now();
    const submission = this.getById(
      this.state.assignmentSubmissions,
      tenantId,
      review.submissionId
    );
    submission.status = 'reviewed';
    submission.updatedAt = this.now();
    this.audit(
      tenantId,
      actorId,
      'assessment.assignment_review_completed',
      'assessment.assignment_review',
      review.id,
      undefined,
      review,
      context
    );
    return review;
  }
  private pushEnrollmentStatusHistory(
    tenantId: string,
    enrollmentId: string,
    status: EnrollmentStatus,
    reason?: string
  ): void {
    this.state.enrollmentStatusHistory.push({
      id: this.id('esh'),
      tenantId,
      enrollmentId,
      status,
      reason,
      changedAt: this.now()
    });
  }

  private canTransitionEnrollment(from: EnrollmentStatus, to: EnrollmentStatus): boolean {
    const transitions: Record<EnrollmentStatus, EnrollmentStatus[]> = {
      pending: ['active', 'cancelled'],
      active: ['suspended', 'completed', 'cancelled'],
      suspended: ['active', 'cancelled'],
      completed: [],
      cancelled: []
    };
    return transitions[from].includes(to);
  }

  private normalizeTestRules(rules?: Partial<TestRulesDto>) {
    const attemptLimit = Math.max(1, rules?.attemptLimit ?? 1);
    const passingScore = Math.max(0, rules?.passingScore ?? 1);
    return {
      attemptLimit,
      dailyResetEnabled: rules?.dailyResetEnabled ?? false,
      randomizeQuestions: rules?.randomizeQuestions ?? false,
      questionCount: rules?.questionCount,
      timeLimitMinutes: rules?.timeLimitMinutes,
      passingScore
    };
  }

  private resolveAttemptQuestionIds(tenantId: string, test: TestEntity): string[] {
    const linked = this.state.testQuestions
      .filter((item) => item.tenantId === tenantId && item.testId === test.id)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((item) => item.questionId);
    const bankIds = test.questionBankId
      ? this.state.questions
          .filter(
            (item) => item.tenantId === tenantId && item.questionBankId === test.questionBankId
          )
          .map((item) => item.id)
      : [];
    let ids = linked.length ? linked : bankIds;
    if (test.rules.randomizeQuestions) ids = [...ids].sort(() => Math.random() - 0.5);
    if (test.rules.questionCount && test.rules.questionCount > 0)
      ids = ids.slice(0, test.rules.questionCount);
    return ids;
  }

  private assertAttemptWritable(attempt: Attempt): void {
    if (attempt.expiresAt && new Date(attempt.expiresAt).getTime() < Date.now()) {
      attempt.status = 'expired';
      attempt.finishedAt = this.now();
    }
    if (['submitted', 'finished', 'expired', 'invalidated'].includes(attempt.status)) {
      throw new PreconditionFailedException({
        code: 'attempt_readonly',
        message: 'Attempt is in terminal state'
      });
    }
  }

  private calculateAttemptScore(
    tenantId: string,
    attemptId: string
  ): { score: number; maxScore: number; passingScore: number } {
    const attempt = this.getById(this.state.attempts, tenantId, attemptId);
    const test = this.getById(this.state.tests, tenantId, attempt.testId);
    const questions = attempt.questionOrder.map((id) =>
      this.getById(this.state.questions, tenantId, id)
    );
    const answers = this.state.attemptAnswers.filter(
      (item) => item.tenantId === tenantId && item.attemptId === attemptId
    );
    let score = 0;
    questions.forEach((question) => {
      const answer = answers.find((item) => item.questionId === question.id);
      const options = this.state.answerOptions.filter(
        (item) => item.tenantId === tenantId && item.questionId === question.id
      );
      if (!answer) return;
      if (question.type === 'text') {
        if ((answer.textAnswer ?? '').trim().length > 0) score += question.maxScore ?? 0;
        return;
      }
      const correctIds = options
        .filter((item) => item.isCorrect)
        .map((item) => item.id)
        .sort();
      const picked = [...(answer.answerOptionIds ?? [])].sort();
      if (JSON.stringify(correctIds) === JSON.stringify(picked)) score += question.maxScore ?? 0;
    });
    return {
      score,
      maxScore: questions.reduce((acc, item) => acc + (item.maxScore ?? 0), 0),
      passingScore: test.rules.passingScore
    };
  }

  private finalizeAttempt(
    tenantId: string,
    actorId: string | undefined,
    id: string,
    context: RequestContext
  ): Attempt {
    const attempt = this.getById(this.state.attempts, tenantId, id);
    if (attempt.status === 'finished') return attempt;
    if (attempt.status === 'in_progress') this.submitAttempt(tenantId, actorId, id, context);
    attempt.status = attempt.status === 'expired' ? 'expired' : 'finished';
    attempt.finishedAt = this.now();
    attempt.updatedAt = this.now();
    this.recalculateExamResult(tenantId, attempt.testId, attempt.enrollmentId, attempt.learnerId);
    this.audit(
      tenantId,
      actorId,
      'assessment.attempt_finished',
      'assessment.attempt',
      attempt.id,
      undefined,
      attempt,
      context
    );
    return attempt;
  }

  private recalculateExamResult(
    tenantId: string,
    testId: string,
    enrollmentId: string,
    learnerId: string
  ): ExamResult {
    const attempts = this.state.attempts.filter(
      (item) =>
        item.tenantId === tenantId &&
        item.testId === testId &&
        item.enrollmentId === enrollmentId &&
        item.learnerId === learnerId &&
        item.status === 'finished'
    );
    const best = [...attempts].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
    const test = this.getById(this.state.tests, tenantId, testId);
    const existing = this.state.examResults.find(
      (item) =>
        item.tenantId === tenantId &&
        item.testId === testId &&
        item.enrollmentId === enrollmentId &&
        item.learnerId === learnerId
    );
    const record: ExamResult = existing ?? {
      id: this.id('res'),
      tenantId,
      testId,
      enrollmentId,
      learnerId,
      attemptsCount: 0,
      bestScore: 0,
      maxScore: 0,
      passingScore: test.rules.passingScore,
      passed: false,
      status: 'active',
      createdAt: this.now(),
      updatedAt: this.now()
    };
    record.attemptsCount = attempts.length;
    record.bestAttemptId = best?.id;
    record.bestScore = best?.score ?? 0;
    record.maxScore = best?.maxScore ?? 0;
    record.passingScore = test.rules.passingScore;
    record.passed = record.bestScore >= record.passingScore;
    record.updatedAt = this.now();
    if (!existing) this.state.examResults.push(record);
    return record;
  }

  private normalizeDurationDays(value: number | undefined): number | undefined {
    if (value === undefined || value === null || Number.isNaN(value)) return undefined;
    const n = Math.floor(Number(value));
    if (n < 1) return undefined;
    return Math.min(n, 3650);
  }

  private learnerIdsBoundToIamActor(
    tenantId: string,
    actorId: string | undefined
  ): string[] | null {
    if (!actorId) return null;
    const ids = this.state.learners
      .filter((l) => l.tenantId === tenantId && l.linkedIamUserId === actorId)
      .map((l) => l.id);
    return ids.length > 0 ? ids : null;
  }

  private hasAssessmentReadBypass(access: MvpAssessmentReadAccess | undefined): boolean {
    return !!access?.permissions?.includes(ASSESSMENT_READ_CROSS_LEARNER_PERMISSION);
  }

  /** Ограничение list-эндпойнтов строками слушателя, привязанного к JWT (кроме админских ролей). */
  private restrictLearnerIdsForAssessmentList(
    tenantId: string,
    access: MvpAssessmentReadAccess | undefined
  ): string[] | null {
    if (!access?.actorId) return null;
    const bound = this.learnerIdsBoundToIamActor(tenantId, access.actorId);
    if (!bound) return null;
    if (this.hasAssessmentReadBypass(access)) return null;
    return bound;
  }

  /** GET по сущности слушателя с linkedIamUserId: свой JWT или bypass-роль. */
  private assertAssessmentReadAllowedForLearner(
    tenantId: string,
    learnerId: string,
    access: MvpAssessmentReadAccess | undefined
  ): void {
    if (!access?.actorId) return;
    if (this.hasAssessmentReadBypass(access)) return;
    this.assertActorMatchesLearnerIamLink(tenantId, access.actorId, learnerId);
  }

  /**
   * Когда слушатель привязан к IAM-пользователю, мутации в его контексте недоступны другим пользователям
   * (соответствие anti-IDOR для прогресса, субмиссий и попытек).
   */
  private assertActorMatchesLearnerIamLink(
    tenantId: string,
    actorId: string | undefined,
    learnerId: string
  ): void {
    const learner = this.getById(this.state.learners, tenantId, learnerId);
    if (!learner.linkedIamUserId) return;
    if (!actorId || actorId !== learner.linkedIamUserId) {
      throw new ForbiddenException({
        code: 'forbidden',
        message: 'Access denied for this learner enrollment or attempt context'
      });
    }
  }

  private ensureClaimedLearnerMatchesEnrollment(
    enrollmentLearnerId: string,
    claimedLearnerId: string
  ): void {
    if (claimedLearnerId !== enrollmentLearnerId) {
      throw new BadRequestException({
        code: 'validation_error',
        message: 'learnerId does not match enrollment learner'
      });
    }
  }

  private validateAssignmentReviewScore(
    tenantId: string,
    assignmentId: string,
    score: number | undefined
  ): void {
    if (score === undefined) {
      return;
    }
    if (score < 0) {
      throw new BadRequestException({
        code: 'validation_error',
        message: 'score must be non-negative'
      });
    }
    const assignment = this.getById(this.state.assignments, tenantId, assignmentId);
    if (score > assignment.maxScore) {
      throw new BadRequestException({
        code: 'validation_error',
        message: 'score exceeds assignment maxScore'
      });
    }
  }

  private computePlannedEndAt(
    tenantId: string,
    groupId: string,
    enrolledAt: string
  ): string | undefined {
    const links = this.state.groupCourses.filter(
      (gc) => gc.tenantId === tenantId && gc.groupId === groupId
    );
    if (!links.length) return undefined;
    const base = Date.parse(enrolledAt);
    if (Number.isNaN(base)) return undefined;
    let maxEnd = base;
    for (const gc of links) {
      const days = gc.durationDays ?? DEFAULT_GROUP_COURSE_DURATION_DAYS;
      const end = base + days * 86_400_000;
      if (end > maxEnd) maxEnd = end;
    }
    return new Date(maxEnd).toISOString();
  }

  private dayBucket(enabled: boolean): string | undefined {
    if (!enabled) return undefined;
    return new Date().toISOString().slice(0, 10);
  }

  private list<T extends BaseEntity>(
    source: T[],
    tenantId: string,
    query: BaseFilterQuery
  ): ListResponse<T> {
    const page = query.page ?? 1;
    const pageSize = query.page_size ?? 20;
    let items = source.filter((item) => item.tenantId === tenantId);
    if (query.q) {
      const q = query.q.toLowerCase();
      items = items.filter((item) => JSON.stringify(item).toLowerCase().includes(q));
    }
    if (query.status) {
      items = items.filter((item) => item.status === query.status);
    }
    if (query.group_id) {
      items = items.filter(
        (item) => String((item as Record<string, unknown>).groupId ?? '') === query.group_id
      );
    }
    if (query.learner_id) {
      items = items.filter(
        (item) => String((item as Record<string, unknown>).learnerId ?? '') === query.learner_id
      );
    }
    if (query.course_id) {
      items = items.filter(
        (item) => String((item as Record<string, unknown>).courseId ?? '') === query.course_id
      );
    }
    if (query.course_version_id) {
      items = items.filter(
        (item) =>
          String((item as Record<string, unknown>).courseVersionId ?? '') ===
          query.course_version_id
      );
    }
    if (query.module_id) {
      items = items.filter(
        (item) => String((item as Record<string, unknown>).moduleId ?? '') === query.module_id
      );
    }
    if (query.test_id) {
      items = items.filter(
        (item) => String((item as Record<string, unknown>).testId ?? '') === query.test_id
      );
    }
    if (query.enrollment_id) {
      items = items.filter(
        (item) =>
          String((item as Record<string, unknown>).enrollmentId ?? '') === query.enrollment_id
      );
    }
    if (query.assignment_id) {
      items = items.filter(
        (item) =>
          String((item as Record<string, unknown>).assignmentId ?? '') === query.assignment_id
      );
    }
    if (query.created_from) {
      const fromDate = new Date(query.created_from);
      if (!Number.isNaN(fromDate.getTime())) {
        items = items.filter((item) => new Date(item.createdAt) >= fromDate);
      }
    }
    if (query.created_to) {
      const toDate = new Date(query.created_to);
      if (!Number.isNaN(toDate.getTime())) {
        items = items.filter((item) => new Date(item.createdAt) <= toDate);
      }
    }
    if (query.planned_end_from) {
      const fromTs = Date.parse(query.planned_end_from);
      if (!Number.isNaN(fromTs)) {
        items = items.filter((item) => {
          const p = (item as Record<string, unknown>).plannedEndAt;
          if (!p || typeof p !== 'string') return false;
          return Date.parse(p) >= fromTs;
        });
      }
    }
    if (query.planned_end_to) {
      const toTs = Date.parse(query.planned_end_to);
      if (!Number.isNaN(toTs)) {
        items = items.filter((item) => {
          const p = (item as Record<string, unknown>).plannedEndAt;
          if (!p || typeof p !== 'string') return false;
          return Date.parse(p) <= toTs;
        });
      }
    }
    if (query.sort) {
      const [rawKey, direction] = query.sort.split(':');
      const key = rawKey ?? 'id';
      items = [...items].sort((a, b) => {
        const av = String((a as Record<string, unknown>)[key] ?? '');
        const bv = String((b as Record<string, unknown>)[key] ?? '');
        return direction === 'desc' ? bv.localeCompare(av) : av.localeCompare(bv);
      });
    }
    const total = items.length;
    const from = (page - 1) * pageSize;
    const to = from + pageSize;
    return { items: items.slice(from, to), page, pageSize, total };
  }

  private lookup<T extends BaseEntity>(
    source: T[],
    tenantId: string,
    query: BaseFilterQuery,
    labelResolver: (item: T) => string
  ): ListResponse<LookupItem> {
    const listed = this.list(source, tenantId, query);
    return {
      ...listed,
      items: listed.items.map((item) => ({
        id: item.id,
        label: labelResolver(item),
        status: item.status
      }))
    };
  }

  private getById<T extends BaseEntity>(source: T[], tenantId: string, id: string): T {
    const result = source.find((item) => item.id === id);
    if (!result) {
      throw new NotFoundException({ code: 'not_found', message: 'Entity not found' });
    }
    this.tenantScopedRepository.enforceTenantScope(tenantId, result.tenantId);
    return result;
  }

  private id(prefix: string): string {
    return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
  }

  private now(): string {
    return new Date().toISOString();
  }

  private normalizePercent(value: number): number {
    return Math.min(100, Math.max(0, Math.round(value * 100) / 100));
  }

  private audit(
    tenantId: string,
    actorId: string | undefined,
    action: string,
    entityType: string,
    entityId: string,
    oldValues: unknown,
    newValues: unknown,
    context: RequestContext
  ): void {
    this.auditService.write({
      tenantId,
      actorId,
      action,
      entityType,
      entityId,
      oldValues: oldValues as Record<string, unknown> | undefined,
      newValues: newValues as Record<string, unknown> | undefined,
      requestId: context.requestId,
      ip: context.ip,
      userAgent: context.userAgent
    });
  }
}
