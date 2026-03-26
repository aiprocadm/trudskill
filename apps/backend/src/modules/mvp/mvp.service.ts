import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  PreconditionFailedException
} from '@nestjs/common';
import { TenantScopedRepository } from '../../infrastructure/database/tenant-repository.js';
import { AuditService } from '../audit/audit.service.js';
import type { RequestContext } from '../../common/context/request-context.js';
import type {
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
  GroupCourse,
  GroupEntity,
  Learner,
  Material,
  MaterialProgress,
  ModuleProgress,
  ProgressStatus
} from './mvp.types.js';
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
  UpdateSimpleRegistryRequest
} from './mvp.dto.js';

interface ListResponse<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}

@Injectable()
export class MvpService {
  private counterparties: Counterparty[] = [];
  private learners: Learner[] = [];
  private directions: Direction[] = [];
  private courses: Course[] = [];
  private courseVersions: CourseVersion[] = [];
  private modules: CourseModuleEntity[] = [];
  private materials: Material[] = [];
  private groups: GroupEntity[] = [];
  private groupCourses: GroupCourse[] = [];
  private enrollments: Enrollment[] = [];
  private enrollmentStatusHistory: EnrollmentStatusHistory[] = [];
  private materialProgress: MaterialProgress[] = [];
  private moduleProgress: ModuleProgress[] = [];
  private courseProgress: CourseProgress[] = [];

  constructor(
    private readonly tenantScopedRepository: TenantScopedRepository,
    private readonly auditService: AuditService
  ) {}

  listCounterparties(tenantId: string, query: BaseFilterQuery): ListResponse<Counterparty> {
    return this.list(this.counterparties, tenantId, query);
  }

  getCounterparty(tenantId: string, id: string): Counterparty {
    return this.getById(this.counterparties, tenantId, id);
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
    this.counterparties.push(entity);
    this.audit(tenantId, actorId, 'crm.counterparty_created', 'crm.counterparty', entity.id, undefined, entity, context);
    return entity;
  }

  updateCounterparty(tenantId: string, actorId: string | undefined, id: string, request: UpdateSimpleRegistryRequest, context: RequestContext): Counterparty {
    const current = this.getById(this.counterparties, tenantId, id);
    const oldValues = { ...current };
    Object.assign(current, request, { updatedAt: this.now() });
    this.audit(tenantId, actorId, 'crm.counterparty_updated', 'crm.counterparty', current.id, oldValues, current, context);
    return current;
  }

  listLearners(tenantId: string, query: BaseFilterQuery): ListResponse<Learner> {
    return this.list(this.learners, tenantId, query);
  }

  getLearner(tenantId: string, id: string): Learner {
    return this.getById(this.learners, tenantId, id);
  }

  createLearner(tenantId: string, actorId: string | undefined, request: CreateSimpleRegistryRequest, context: RequestContext): Learner {
    const [firstName, lastName] = request.name.split(' ');
    const entity: Learner = {
      id: this.id('learner'),
      tenantId,
      learnerNo: request.code,
      firstName: firstName ?? request.name,
      lastName: lastName ?? '',
      email: undefined,
      status: request.status ?? 'active',
      createdAt: this.now(),
      updatedAt: this.now()
    };
    this.learners.push(entity);
    this.audit(tenantId, actorId, 'learning.learner_created', 'learning.learner', entity.id, undefined, entity, context);
    return entity;
  }

  updateLearner(tenantId: string, actorId: string | undefined, id: string, request: UpdateSimpleRegistryRequest, context: RequestContext): Learner {
    const current = this.getById(this.learners, tenantId, id);
    const oldValues = { ...current };
    if (request.name) {
      const [firstName, lastName] = request.name.split(' ');
      current.firstName = firstName ?? request.name;
      current.lastName = lastName ?? '';
    }
    if (request.status) current.status = request.status;
    current.updatedAt = this.now();
    this.audit(tenantId, actorId, 'learning.learner_updated', 'learning.learner', current.id, oldValues, current, context);
    return current;
  }

  listDirections(tenantId: string, query: BaseFilterQuery): ListResponse<Direction> {
    return this.list(this.directions, tenantId, query);
  }

  getDirection(tenantId: string, id: string): Direction {
    return this.getById(this.directions, tenantId, id);
  }

  createDirection(tenantId: string, actorId: string | undefined, request: CreateSimpleRegistryRequest, context: RequestContext): Direction {
    const entity: Direction = { id: this.id('direction'), tenantId, code: request.code, name: request.name, status: request.status ?? 'active', createdAt: this.now(), updatedAt: this.now() };
    this.directions.push(entity);
    this.audit(tenantId, actorId, 'learning.direction_created', 'learning.direction', entity.id, undefined, entity, context);
    return entity;
  }

  updateDirection(tenantId: string, actorId: string | undefined, id: string, request: UpdateSimpleRegistryRequest, context: RequestContext): Direction {
    const current = this.getById(this.directions, tenantId, id);
    const oldValues = { ...current };
    Object.assign(current, request, { updatedAt: this.now() });
    this.audit(tenantId, actorId, 'learning.direction_updated', 'learning.direction', current.id, oldValues, current, context);
    return current;
  }

  listCourses(tenantId: string, query: BaseFilterQuery): ListResponse<Course> { return this.list(this.courses, tenantId, query); }
  getCourse(tenantId: string, id: string): Course { return this.getById(this.courses, tenantId, id); }

  createCourse(tenantId: string, actorId: string | undefined, request: CreateCourseRequest, context: RequestContext): Course {
    const entity: Course = { id: this.id('course'), tenantId, code: request.code, title: request.title, description: request.description, status: 'draft', isArchived: false, createdAt: this.now(), updatedAt: this.now() };
    this.courses.push(entity);
    this.audit(tenantId, actorId, 'learning.course_created', 'learning.course', entity.id, undefined, entity, context);
    return entity;
  }

  updateCourse(tenantId: string, actorId: string | undefined, id: string, request: UpdateCourseRequest, context: RequestContext): Course {
    const current = this.getById(this.courses, tenantId, id);
    if (current.status === 'archived') {
      throw new PreconditionFailedException({ code: 'domain_rule_violation', message: 'Archived course is read-only' });
    }
    const oldValues = { ...current };
    Object.assign(current, request, { updatedAt: this.now() });
    this.audit(tenantId, actorId, 'learning.course_updated', 'learning.course', current.id, oldValues, current, context);
    return current;
  }

  publishCourse(tenantId: string, actorId: string | undefined, id: string, context: RequestContext): Course {
    const course = this.getById(this.courses, tenantId, id);
    const versions = this.courseVersions.filter((item) => item.tenantId === tenantId && item.courseId === id);
    if (versions.length === 0) {
      throw new PreconditionFailedException({ code: 'precondition_failed', message: 'Course must have at least one version' });
    }
    course.status = 'published';
    course.updatedAt = this.now();
    this.audit(tenantId, actorId, 'learning.course_published', 'learning.course', course.id, undefined, course, context);
    return course;
  }

  archiveCourse(tenantId: string, actorId: string | undefined, id: string, context: RequestContext): Course {
    const course = this.getById(this.courses, tenantId, id);
    course.status = 'archived';
    course.isArchived = true;
    course.updatedAt = this.now();
    this.audit(tenantId, actorId, 'learning.course_archived', 'learning.course', course.id, undefined, course, context);
    return course;
  }

  listCourseVersions(tenantId: string, query: BaseFilterQuery): ListResponse<CourseVersion> { return this.list(this.courseVersions, tenantId, query); }
  getCourseVersion(tenantId: string, id: string): CourseVersion { return this.getById(this.courseVersions, tenantId, id); }
  createCourseVersion(tenantId: string, courseId: string): CourseVersion {
    this.getById(this.courses, tenantId, courseId);
    const versionNo = this.courseVersions.filter((item) => item.courseId === courseId && item.tenantId === tenantId).length + 1;
    const entity: CourseVersion = { id: this.id('cver'), tenantId, courseId, versionNo, status: 'draft', createdAt: this.now(), updatedAt: this.now() };
    this.courseVersions.push(entity);
    return entity;
  }

  listModules(tenantId: string, query: BaseFilterQuery): ListResponse<CourseModuleEntity> { return this.list(this.modules, tenantId, query); }
  getModule(tenantId: string, id: string): CourseModuleEntity { return this.getById(this.modules, tenantId, id); }
  createModule(tenantId: string, actorId: string | undefined, request: CreateModuleRequest, context: RequestContext): CourseModuleEntity {
    if ((request.minViewSeconds ?? 0) < 0) {
      throw new BadRequestException({ code: 'validation_error', message: 'min_view_seconds must be non-negative' });
    }
    this.getById(this.courseVersions, tenantId, request.courseVersionId);
    const entity: CourseModuleEntity = { id: this.id('module'), tenantId, courseVersionId: request.courseVersionId, title: request.title, sortOrder: this.modules.length, minViewSeconds: request.minViewSeconds ?? 0, isRequired: true, status: 'active', createdAt: this.now(), updatedAt: this.now() };
    this.modules.push(entity);
    this.audit(tenantId, actorId, 'learning.module_created', 'learning.module', entity.id, undefined, entity, context);
    return entity;
  }

  listMaterials(tenantId: string, query: BaseFilterQuery): ListResponse<Material> { return this.list(this.materials, tenantId, query); }
  getMaterial(tenantId: string, id: string): Material { return this.getById(this.materials, tenantId, id); }
  createMaterial(tenantId: string, actorId: string | undefined, request: CreateMaterialRequest, context: RequestContext): Material {
    if ((request.minViewSeconds ?? 0) < 0) {
      throw new BadRequestException({ code: 'validation_error', message: 'min_view_seconds must be non-negative' });
    }
    this.getById(this.modules, tenantId, request.moduleId);
    const entity: Material = { id: this.id('material'), tenantId, moduleId: request.moduleId, title: request.title, materialType: request.materialType, sortOrder: this.materials.length, minViewSeconds: request.minViewSeconds ?? 0, isRequired: true, status: 'active', createdAt: this.now(), updatedAt: this.now() };
    this.materials.push(entity);
    this.audit(tenantId, actorId, 'learning.material_created', 'learning.material', entity.id, undefined, entity, context);
    return entity;
  }

  listGroups(tenantId: string, query: BaseFilterQuery): ListResponse<GroupEntity> { return this.list(this.groups, tenantId, query); }
  getGroup(tenantId: string, id: string): GroupEntity { return this.getById(this.groups, tenantId, id); }
  createGroup(tenantId: string, actorId: string | undefined, request: CreateSimpleRegistryRequest, context: RequestContext): GroupEntity {
    const entity: GroupEntity = { id: this.id('group'), tenantId, code: request.code, name: request.name, status: request.status ?? 'draft', createdAt: this.now(), updatedAt: this.now() };
    this.groups.push(entity);
    this.audit(tenantId, actorId, 'learning.group_created', 'learning.group', entity.id, undefined, entity, context);
    return entity;
  }

  listGroupCourses(tenantId: string, query: BaseFilterQuery): ListResponse<GroupCourse> { return this.list(this.groupCourses, tenantId, query); }
  getGroupCourse(tenantId: string, id: string): GroupCourse { return this.getById(this.groupCourses, tenantId, id); }
  createGroupCourse(tenantId: string, request: CreateGroupCourseRequest): GroupCourse {
    this.getById(this.groups, tenantId, request.groupId);
    this.getById(this.courses, tenantId, request.courseId);
    const entity: GroupCourse = { id: this.id('gc'), tenantId, groupId: request.groupId, courseId: request.courseId, sortOrder: this.groupCourses.length, status: 'active', createdAt: this.now(), updatedAt: this.now() };
    this.groupCourses.push(entity);
    return entity;
  }

  listEnrollments(tenantId: string, query: BaseFilterQuery): ListResponse<Enrollment> { return this.list(this.enrollments, tenantId, query); }
  getEnrollment(tenantId: string, id: string): Enrollment { return this.getById(this.enrollments, tenantId, id); }

  createEnrollment(tenantId: string, actorId: string | undefined, request: CreateEnrollmentRequest, context: RequestContext): Enrollment {
    this.getById(this.groups, tenantId, request.groupId);
    this.getById(this.learners, tenantId, request.learnerId);
    const duplicate = this.enrollments.some((item) => item.tenantId === tenantId && item.groupId === request.groupId && item.learnerId === request.learnerId);
    if (duplicate) {
      throw new ConflictException({ code: 'conflict', message: 'Enrollment already exists for pair(group, learner)' });
    }
    const now = this.now();
    const entity: Enrollment = { id: this.id('enrollment'), tenantId, groupId: request.groupId, learnerId: request.learnerId, status: 'pending', enrolledAt: now, createdAt: now, updatedAt: now };
    this.enrollments.push(entity);
    this.pushEnrollmentStatusHistory(tenantId, entity.id, entity.status, undefined);
    this.audit(tenantId, actorId, 'learning.enrollment_created', 'learning.enrollment', entity.id, undefined, entity, context);
    return entity;
  }

  changeEnrollmentStatus(tenantId: string, actorId: string | undefined, enrollmentId: string, request: UpdateEnrollmentStatusRequest, context: RequestContext): Enrollment {
    const enrollment = this.getById(this.enrollments, tenantId, enrollmentId);
    const allowed = this.canTransitionEnrollment(enrollment.status, request.status);
    if (!allowed) {
      throw new PreconditionFailedException({ code: 'domain_rule_violation', message: `Transition ${enrollment.status} -> ${request.status} is not allowed` });
    }
    const oldValues = { ...enrollment };
    enrollment.status = request.status;
    enrollment.updatedAt = this.now();
    enrollment.completedAt = request.status === 'completed' ? this.now() : enrollment.completedAt;
    this.pushEnrollmentStatusHistory(tenantId, enrollment.id, request.status, request.reason);
    this.audit(tenantId, actorId, 'learning.enrollment_status_changed', 'learning.enrollment', enrollment.id, oldValues, enrollment, context);
    return enrollment;
  }

  listProgress(tenantId: string, query: BaseFilterQuery): ListResponse<CourseProgress> {
    return this.list(this.courseProgress, tenantId, query);
  }

  getProgress(tenantId: string, id: string): CourseProgress {
    return this.getById(this.courseProgress, tenantId, id);
  }

  listEnrollmentStatusHistory(tenantId: string, enrollmentId: string): EnrollmentStatusHistory[] {
    return this.enrollmentStatusHistory.filter((item) => item.tenantId === tenantId && item.enrollmentId === enrollmentId);
  }

  upsertMaterialProgress(tenantId: string, actorId: string | undefined, materialId: string, request: UpdateMaterialProgressRequest, context: RequestContext): MaterialProgress {
    const material = this.getById(this.materials, tenantId, materialId);
    const moduleEntity = this.getById(this.modules, tenantId, material.moduleId);
    const courseVersion = this.getById(this.courseVersions, tenantId, moduleEntity.courseVersionId);

    const enrollment = this.enrollments.find((item) => item.tenantId === tenantId);
    if (!enrollment) {
      throw new NotFoundException({ code: 'not_found', message: 'Enrollment not found for progress update' });
    }

    if (request.studiedSeconds < 0) {
      throw new BadRequestException({ code: 'validation_error', message: 'studied_seconds must be non-negative' });
    }

    const now = this.now();
    const requiredSeconds = material.minViewSeconds;
    const existing = this.materialProgress.find((item) => item.tenantId === tenantId && item.materialId === materialId && item.enrollmentId === enrollment.id);

    const studiedSeconds = Math.max(0, request.studiedSeconds);
    const ratio = requiredSeconds === 0 ? 1 : Math.min(1, studiedSeconds / requiredSeconds);
    const percent = Math.round(ratio * 10000) / 100;
    const status: ProgressStatus = percent >= 100 ? 'completed' : percent > 0 ? 'in_progress' : 'not_started';

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
    record.updatedAt = now;
    record.completedAt = status === 'completed' ? now : undefined;

    if (!existing) this.materialProgress.push(record);

    this.recalculateModuleProgress(tenantId, enrollment.id, moduleEntity.id, courseVersion.courseId);
    this.recalculateCourseProgress(tenantId, enrollment.id, courseVersion.courseId);

    this.audit(tenantId, actorId, 'learning.progress_updated', 'learning.material_progress', record.id, undefined, record, context);
    return record;
  }

  private recalculateModuleProgress(tenantId: string, enrollmentId: string, moduleId: string, courseId: string): void {
    const moduleMaterials = this.materialProgress.filter((item) => item.tenantId === tenantId && item.enrollmentId === enrollmentId && item.moduleId === moduleId);
    const requiredSeconds = moduleMaterials.reduce((acc, item) => acc + item.requiredSeconds, 0);
    const studiedSeconds = moduleMaterials.reduce((acc, item) => acc + item.studiedSeconds, 0);
    const ratio = requiredSeconds === 0 ? 1 : Math.min(1, studiedSeconds / requiredSeconds);
    const progressPercent = Math.round(ratio * 10000) / 100;
    const status: ProgressStatus = progressPercent >= 100 ? 'completed' : progressPercent > 0 ? 'in_progress' : 'not_started';
    const now = this.now();
    const existing = this.moduleProgress.find((item) => item.tenantId === tenantId && item.enrollmentId === enrollmentId && item.moduleId === moduleId);
    const record: ModuleProgress = existing ?? {
      id: this.id('modp'), tenantId, enrollmentId, courseId, moduleId, status, progressPercent, studiedSeconds, requiredSeconds, createdAt: now, updatedAt: now
    };
    record.status = status;
    record.progressPercent = progressPercent;
    record.requiredSeconds = requiredSeconds;
    record.studiedSeconds = studiedSeconds;
    record.lastActivityAt = now;
    record.updatedAt = now;
    record.completedAt = status === 'completed' ? now : undefined;
    if (!existing) this.moduleProgress.push(record);
  }

  private recalculateCourseProgress(tenantId: string, enrollmentId: string, courseId: string): void {
    const moduleProgress = this.moduleProgress.filter((item) => item.tenantId === tenantId && item.enrollmentId === enrollmentId && item.courseId === courseId);
    const requiredSeconds = moduleProgress.reduce((acc, item) => acc + item.requiredSeconds, 0);
    const studiedSeconds = moduleProgress.reduce((acc, item) => acc + item.studiedSeconds, 0);
    const ratio = requiredSeconds === 0 ? 1 : Math.min(1, studiedSeconds / requiredSeconds);
    const progressPercent = Math.round(ratio * 10000) / 100;
    const status: ProgressStatus = progressPercent >= 100 ? 'completed' : progressPercent > 0 ? 'in_progress' : 'not_started';
    const now = this.now();
    const existing = this.courseProgress.find((item) => item.tenantId === tenantId && item.enrollmentId === enrollmentId && item.courseId === courseId);
    const record: CourseProgress = existing ?? {
      id: this.id('cpg'), tenantId, enrollmentId, courseId, status, progressPercent, studiedSeconds, requiredSeconds, createdAt: now, updatedAt: now
    };
    record.status = status;
    record.progressPercent = progressPercent;
    record.requiredSeconds = requiredSeconds;
    record.studiedSeconds = studiedSeconds;
    record.lastActivityAt = now;
    record.updatedAt = now;
    record.completedAt = status === 'completed' ? now : undefined;
    if (!existing) this.courseProgress.push(record);
  }

  private pushEnrollmentStatusHistory(tenantId: string, enrollmentId: string, status: EnrollmentStatus, reason?: string): void {
    this.enrollmentStatusHistory.push({ id: this.id('esh'), tenantId, enrollmentId, status, reason, changedAt: this.now() });
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

  private list<T extends BaseEntity>(source: T[], tenantId: string, query: BaseFilterQuery): ListResponse<T> {
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
    if (query.created_from) {
      items = items.filter((item) => item.createdAt >= query.created_from!);
    }
    if (query.created_to) {
      items = items.filter((item) => item.createdAt <= query.created_to!);
    }
    if (query.sort) {
      const [key, direction] = query.sort.split(':');
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

  private audit(
    tenantId: string,
    actorId: string | undefined,
    action: string,
    entityType: string,
    entityId: string,
    oldValues: Record<string, unknown> | undefined,
    newValues: Record<string, unknown> | undefined,
    context: RequestContext
  ): void {
    this.auditService.write({
      tenantId,
      actorId,
      action,
      entityType,
      entityId,
      oldValues,
      newValues,
      requestId: context.requestId,
      ip: context.ip,
      userAgent: context.userAgent
    });
  }
}
