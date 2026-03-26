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
  Question,
  QuestionBank,
  AnswerOption,
  TestEntity,
  Attempt,
  AttemptAnswer,
  ExamResult,
  Assignment,
  AssignmentSubmission,
  AssignmentReview,
  MaterialProgress,
  ModuleProgress,
  ProgressStatus,
  Question,
  QuestionBank,
  AnswerOption,
  TestEntity,
  TestQuestion,
  TestAttempt,
  AttemptAnswer,
  ExamResult,
  Assignment,
  AssignmentSubmission,
  AssignmentReview
} from './mvp.types.js';
import type {
  BaseFilterQuery,
  CreateCourseRequest,
  CreateEnrollmentRequest,
  CreateGroupCourseRequest,
  CreateMaterialRequest,
  CreateModuleRequest,
  CreateSimpleRegistryRequest,
  CreateQuestionBankRequest,
  UpdateQuestionBankRequest,
  CreateQuestionRequest,
  UpdateQuestionRequest,
  CreateTestRequest,
  UpdateTestRequest,
  TestRulesDto,
  StartAttemptRequest,
  SaveAnswerRequest,
  CreateAssignmentRequest,
  UpdateAssignmentRequest,
  CreateAssignmentSubmissionRequest,
  UpdateAssignmentSubmissionRequest,
  CreateAssignmentReviewRequest,
  UpdateAssignmentReviewRequest,
  UpdateCourseRequest,
  UpdateEnrollmentStatusRequest,
  UpdateMaterialProgressRequest,
  UpdateMaterialRequest,
  UpdateModuleRequest,
  UpdateSimpleRegistryRequest,
  CreateQuestionBankRequest,
  UpdateQuestionBankRequest,
  CreateQuestionRequest,
  UpdateQuestionRequest,
  CreateTestRequest,
  UpdateTestRequest,
  PatchTestRulesRequest,
  StartAttemptRequest,
  SaveAttemptAnswerRequest,
  CreateAssignmentRequest,
  UpdateAssignmentRequest,
  CreateAssignmentSubmissionRequest,
  UpdateAssignmentSubmissionRequest,
  CreateAssignmentReviewRequest
} from './mvp.dto.js';

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
  private questionBanks: QuestionBank[] = [];
  private questions: Question[] = [];
  private answerOptions: AnswerOption[] = [];
  private tests: TestEntity[] = [];
  private testQuestions: { id: string; tenantId: string; testId: string; questionId: string; sortOrder: number; createdAt: string; updatedAt: string }[] = [];
  private attempts: Attempt[] = [];
  private testQuestions: TestQuestion[] = [];
  private attempts: TestAttempt[] = [];
  private attemptAnswers: AttemptAnswer[] = [];
  private examResults: ExamResult[] = [];
  private assignments: Assignment[] = [];
  private assignmentSubmissions: AssignmentSubmission[] = [];
  private assignmentReviews: AssignmentReview[] = [];

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

  lookupCounterparties(tenantId: string, query: BaseFilterQuery): ListResponse<LookupItem> {
    return this.lookup(this.counterparties, tenantId, query, (item) => item.name);
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

  lookupLearners(tenantId: string, query: BaseFilterQuery): ListResponse<LookupItem> {
    return this.lookup(this.learners, tenantId, query, (item) => `${item.firstName} ${item.lastName}`.trim());
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

  lookupDirections(tenantId: string, query: BaseFilterQuery): ListResponse<LookupItem> {
    return this.lookup(this.directions, tenantId, query, (item) => item.name);
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
  lookupCourses(tenantId: string, query: BaseFilterQuery): ListResponse<LookupItem> { return this.lookup(this.courses, tenantId, query, (item) => item.title); }

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
    const entity: CourseModuleEntity = { id: this.id('module'), tenantId, courseVersionId: request.courseVersionId, title: request.title, sortOrder: this.modules.length, minViewSeconds: request.minViewSeconds ?? 0, isRequired: request.isRequired ?? true, status: 'active', createdAt: this.now(), updatedAt: this.now() };
    this.modules.push(entity);
    this.audit(tenantId, actorId, 'learning.module_created', 'learning.module', entity.id, undefined, entity, context);
    return entity;
  }
  updateModule(tenantId: string, actorId: string | undefined, id: string, request: UpdateModuleRequest, context: RequestContext): CourseModuleEntity {
    if (typeof request.minViewSeconds === 'number' && request.minViewSeconds < 0) {
      throw new BadRequestException({ code: 'validation_error', message: 'min_view_seconds must be non-negative' });
    }
    const current = this.getById(this.modules, tenantId, id);
    const oldValues = { ...current };
    Object.assign(current, request, { updatedAt: this.now() });
    this.audit(tenantId, actorId, 'learning.module_updated', 'learning.module', current.id, oldValues, current, context);
    return current;
  }

  listMaterials(tenantId: string, query: BaseFilterQuery): ListResponse<Material> { return this.list(this.materials, tenantId, query); }
  getMaterial(tenantId: string, id: string): Material { return this.getById(this.materials, tenantId, id); }
  createMaterial(tenantId: string, actorId: string | undefined, request: CreateMaterialRequest, context: RequestContext): Material {
    if ((request.minViewSeconds ?? 0) < 0) {
      throw new BadRequestException({ code: 'validation_error', message: 'min_view_seconds must be non-negative' });
    }
    this.getById(this.modules, tenantId, request.moduleId);
    const entity: Material = { id: this.id('material'), tenantId, moduleId: request.moduleId, title: request.title, materialType: request.materialType, sortOrder: this.materials.length, minViewSeconds: request.minViewSeconds ?? 0, isRequired: request.isRequired ?? true, fileId: request.fileId, status: 'active', createdAt: this.now(), updatedAt: this.now() };
    this.materials.push(entity);
    this.audit(tenantId, actorId, 'learning.material_created', 'learning.material', entity.id, undefined, entity, context);
    return entity;
  }
  updateMaterial(tenantId: string, actorId: string | undefined, id: string, request: UpdateMaterialRequest, context: RequestContext): Material {
    if (typeof request.minViewSeconds === 'number' && request.minViewSeconds < 0) {
      throw new BadRequestException({ code: 'validation_error', message: 'min_view_seconds must be non-negative' });
    }
    const current = this.getById(this.materials, tenantId, id);
    const oldValues = { ...current };
    Object.assign(current, request, { updatedAt: this.now() });
    this.audit(tenantId, actorId, 'learning.material_updated', 'learning.material', current.id, oldValues, current, context);
    return current;
  }

  listGroups(tenantId: string, query: BaseFilterQuery): ListResponse<GroupEntity> { return this.list(this.groups, tenantId, query); }
  getGroup(tenantId: string, id: string): GroupEntity { return this.getById(this.groups, tenantId, id); }
  lookupGroups(tenantId: string, query: BaseFilterQuery): ListResponse<LookupItem> { return this.lookup(this.groups, tenantId, query, (item) => item.name); }
  createGroup(tenantId: string, actorId: string | undefined, request: CreateSimpleRegistryRequest, context: RequestContext): GroupEntity {
    const entity: GroupEntity = { id: this.id('group'), tenantId, code: request.code, name: request.name, status: request.status ?? 'draft', createdAt: this.now(), updatedAt: this.now() };
    this.groups.push(entity);
    this.audit(tenantId, actorId, 'learning.group_created', 'learning.group', entity.id, undefined, entity, context);
    return entity;
  }
  updateGroup(tenantId: string, actorId: string | undefined, id: string, request: UpdateSimpleRegistryRequest, context: RequestContext): GroupEntity {
    const current = this.getById(this.groups, tenantId, id);
    const oldValues = { ...current };
    Object.assign(current, request, { updatedAt: this.now() });
    this.audit(tenantId, actorId, 'learning.group_updated', 'learning.group', current.id, oldValues, current, context);
    return current;
  }

  listGroupCourses(tenantId: string, query: BaseFilterQuery): ListResponse<GroupCourse> { return this.list(this.groupCourses, tenantId, query); }
  getGroupCourse(tenantId: string, id: string): GroupCourse { return this.getById(this.groupCourses, tenantId, id); }
  createGroupCourse(tenantId: string, request: CreateGroupCourseRequest): GroupCourse {
    this.getById(this.groups, tenantId, request.groupId);
    this.getById(this.courses, tenantId, request.courseId);
    const duplicate = this.groupCourses.some((item) => item.tenantId === tenantId && item.groupId === request.groupId && item.courseId === request.courseId);
    if (duplicate) {
      throw new ConflictException({ code: 'conflict', message: 'Group course already exists for pair(group, course)' });
    }
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

    const enrollment = this.enrollments.find((item) => item.tenantId === tenantId && item.id === request.enrollmentId);
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
    const percent = this.normalizePercent(ratio * 100);
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
    record.calculatedAt = now;
    record.updatedAt = now;
    record.completedAt = status === 'completed' ? now : undefined;

    if (!existing) this.materialProgress.push(record);

    this.recalculateModuleProgress(tenantId, enrollment.id, moduleEntity.id, courseVersion.courseId);
    this.recalculateCourseProgress(tenantId, enrollment.id, courseVersion.courseId);

    this.audit(tenantId, actorId, 'learning.progress_updated', 'learning.material_progress', record.id, undefined, record, context);
    return record;
  }

  listQuestionBanks(tenantId: string, query: BaseFilterQuery): ListResponse<QuestionBank> { return this.list(this.questionBanks, tenantId, query); }
  getQuestionBank(tenantId: string, id: string): QuestionBank { return this.getById(this.questionBanks, tenantId, id); }
  createQuestionBank(tenantId: string, actorId: string | undefined, request: CreateQuestionBankRequest, context: RequestContext): QuestionBank {
    if (request.courseId) this.getById(this.courses, tenantId, request.courseId);
    const now = this.now();
    const entity: QuestionBank = { id: this.id('qbank'), tenantId, title: request.title, description: request.description, courseId: request.courseId, status: 'draft', createdAt: now, updatedAt: now };
    this.questionBanks.push(entity);
    this.audit(tenantId, actorId, 'assessment.question_bank_created', 'assessment.question_bank', entity.id, undefined, entity, context);
    return entity;
  }
  updateQuestionBank(tenantId: string, actorId: string | undefined, id: string, request: UpdateQuestionBankRequest, context: RequestContext): QuestionBank {
    const entity = this.getById(this.questionBanks, tenantId, id);
    const oldValues = { ...entity };
    Object.assign(entity, request, { updatedAt: this.now() });
    this.audit(tenantId, actorId, 'assessment.question_bank_updated', 'assessment.question_bank', entity.id, oldValues, entity, context);
    return entity;
  }
  archiveQuestionBank(tenantId: string, actorId: string | undefined, id: string, context: RequestContext): QuestionBank {
    return this.updateQuestionBank(tenantId, actorId, id, { status: 'archived' }, context);
  }
  listQuestionBankQuestions(tenantId: string, questionBankId: string, query: BaseFilterQuery): ListResponse<Question> {
    this.getById(this.questionBanks, tenantId, questionBankId);
    return this.list(this.questions.filter((q) => q.questionBankId === questionBankId), tenantId, query);
  }

  listQuestions(tenantId: string, query: BaseFilterQuery): ListResponse<Question> { return this.list(this.questions, tenantId, query); }
  getQuestion(tenantId: string, id: string): Question { return this.getById(this.questions, tenantId, id); }
  createQuestion(tenantId: string, actorId: string | undefined, request: CreateQuestionRequest, context: RequestContext): Question {
    this.getById(this.questionBanks, tenantId, request.questionBankId);
    const now = this.now();
    const question: Question = { id: this.id('q'), tenantId, questionBankId: request.questionBankId, text: request.text, explanation: request.explanation, type: request.type, maxScore: request.maxScore ?? 1, status: 'active', createdAt: now, updatedAt: now };
    this.questions.push(question);
    request.options?.forEach((option, index) => this.answerOptions.push({ id: this.id('opt'), tenantId, questionId: question.id, text: option.text, isCorrect: option.isCorrect ?? false, sortOrder: index, status: 'active', createdAt: now, updatedAt: now }));
    this.audit(tenantId, actorId, 'assessment.question_created', 'assessment.question', question.id, undefined, question, context);
    return question;
  }
  updateQuestion(tenantId: string, actorId: string | undefined, id: string, request: UpdateQuestionRequest, context: RequestContext): Question {
    const question = this.getById(this.questions, tenantId, id);
    const oldValues = { ...question };
    Object.assign(question, { text: request.text ?? question.text, explanation: request.explanation ?? question.explanation, status: request.status ?? question.status, maxScore: request.maxScore ?? question.maxScore, updatedAt: this.now() });
    if (request.options) {
      this.answerOptions = this.answerOptions.filter((item) => !(item.tenantId === tenantId && item.questionId === id));
      request.options.forEach((option, index) => this.answerOptions.push({ id: this.id('opt'), tenantId, questionId: id, text: option.text, isCorrect: option.isCorrect ?? false, sortOrder: index, status: 'active', createdAt: this.now(), updatedAt: this.now() }));
    }
    this.audit(tenantId, actorId, 'assessment.question_updated', 'assessment.question', question.id, oldValues, question, context);
    return question;
  }
  archiveQuestion(tenantId: string, actorId: string | undefined, id: string, context: RequestContext): Question {
    return this.updateQuestion(tenantId, actorId, id, { status: 'archived' }, context);
  }

  listTests(tenantId: string, query: BaseFilterQuery): ListResponse<TestEntity> { return this.list(this.tests, tenantId, query); }
  getTest(tenantId: string, id: string): TestEntity { return this.getById(this.tests, tenantId, id); }
  createTest(tenantId: string, actorId: string | undefined, request: CreateTestRequest, context: RequestContext): TestEntity {
    this.getById(this.courses, tenantId, request.courseId);
    if (request.questionBankId) this.getById(this.questionBanks, tenantId, request.questionBankId);
    const now = this.now();
    const rules = this.normalizeTestRules(request.rules);
    const test: TestEntity = { id: this.id('test'), tenantId, title: request.title, courseId: request.courseId, questionBankId: request.questionBankId, rules, status: 'draft', createdAt: now, updatedAt: now };
    this.tests.push(test);
    this.audit(tenantId, actorId, 'assessment.test_created', 'assessment.test', test.id, undefined, test, context);
    return test;
  }
  updateTest(tenantId: string, actorId: string | undefined, id: string, request: UpdateTestRequest, context: RequestContext): TestEntity {
    const test = this.getById(this.tests, tenantId, id);
    const oldValues = { ...test };
    Object.assign(test, request, { updatedAt: this.now() });
    this.audit(tenantId, actorId, 'assessment.test_updated', 'assessment.test', test.id, oldValues, test, context);
    return test;
  }
  publishTest(tenantId: string, actorId: string | undefined, id: string, context: RequestContext): TestEntity {
    const test = this.getById(this.tests, tenantId, id);
    test.status = 'published';
    test.publishedAt = this.now();
    test.updatedAt = this.now();
    this.audit(tenantId, actorId, 'assessment.test_published', 'assessment.test', test.id, undefined, test, context);
    return test;
  }
  archiveTest(tenantId: string, actorId: string | undefined, id: string, context: RequestContext): TestEntity {
    const test = this.getById(this.tests, tenantId, id);
    test.status = 'archived';
    test.archivedAt = this.now();
    test.updatedAt = this.now();
    return test;
  }
  updateTestRules(tenantId: string, actorId: string | undefined, id: string, rules: Partial<TestRulesDto>, context: RequestContext): TestEntity {
    const test = this.getById(this.tests, tenantId, id);
    test.rules = this.normalizeTestRules({ ...test.rules, ...rules });
    test.updatedAt = this.now();
    this.audit(tenantId, actorId, 'assessment.test_rules_updated', 'assessment.test', test.id, undefined, test, context);
    return test;
  }
  addTestQuestions(tenantId: string, testId: string, questionIds: string[]): { count: number } {
    this.getById(this.tests, tenantId, testId);
    questionIds.forEach((questionId) => {
      this.getById(this.questions, tenantId, questionId);
      const duplicate = this.testQuestions.some((item) => item.tenantId === tenantId && item.testId === testId && item.questionId === questionId);
      if (!duplicate) this.testQuestions.push({ id: this.id('tq'), tenantId, testId, questionId, sortOrder: this.testQuestions.length, createdAt: this.now(), updatedAt: this.now() });
    });
    return { count: this.testQuestions.filter((item) => item.tenantId === tenantId && item.testId === testId).length };
  }
  listTestQuestions(tenantId: string, testId: string): { questionId: string; sortOrder: number }[] {
    return this.testQuestions.filter((item) => item.tenantId === tenantId && item.testId === testId).map((item) => ({ questionId: item.questionId, sortOrder: item.sortOrder }));
  }

  listAttempts(tenantId: string, query: BaseFilterQuery): ListResponse<Attempt> { return this.list(this.attempts, tenantId, query); }
  getAttempt(tenantId: string, id: string): Attempt { return this.getById(this.attempts, tenantId, id); }
  startAttempt(tenantId: string, actorId: string | undefined, request: StartAttemptRequest, context: RequestContext): Attempt {
    const test = this.getById(this.tests, tenantId, request.testId);
    this.getById(this.enrollments, tenantId, request.enrollmentId);
    const dayKey = this.dayBucket(test.rules.dailyResetEnabled);
    const attemptsForLimit = this.attempts.filter((item) =>
      item.tenantId === tenantId && item.testId === request.testId && item.learnerId === request.learnerId && (!dayKey || item.createdAt.startsWith(dayKey))
    );
    if (attemptsForLimit.length >= test.rules.attemptLimit) {
      throw new PreconditionFailedException({ code: 'attempt_limit_exceeded', message: 'Attempt limit exceeded' });
    }
    const active = this.attempts.find((item) => item.tenantId === tenantId && item.testId === request.testId && item.learnerId === request.learnerId && item.status === 'in_progress');
    if (active) return active;

    const questionIds = this.resolveAttemptQuestionIds(tenantId, test);
    const now = new Date();
    const expiresAt = test.rules.timeLimitMinutes ? new Date(now.getTime() + test.rules.timeLimitMinutes * 60_000).toISOString() : undefined;
    const attempt: Attempt = { id: this.id('attempt'), tenantId, testId: request.testId, enrollmentId: request.enrollmentId, learnerId: request.learnerId, attemptNo: attemptsForLimit.length + 1, status: 'in_progress', startedAt: now.toISOString(), expiresAt, questionOrder: questionIds, createdAt: now.toISOString(), updatedAt: now.toISOString() };
    this.attempts.push(attempt);
    this.audit(tenantId, actorId, 'assessment.attempt_started', 'assessment.attempt', attempt.id, undefined, attempt, context);
    return attempt;
  }
  saveAttemptAnswer(tenantId: string, actorId: string | undefined, attemptId: string, request: SaveAnswerRequest, context: RequestContext): AttemptAnswer {
    const attempt = this.getById(this.attempts, tenantId, attemptId);
    this.assertAttemptWritable(attempt);
    if (!attempt.questionOrder.includes(request.questionId)) throw new BadRequestException({ code: 'question_not_in_attempt', message: 'Question does not belong to attempt' });
    this.getById(this.questions, tenantId, request.questionId);
    const existing = this.attemptAnswers.find((item) => item.tenantId === tenantId && item.attemptId === attemptId && item.questionId === request.questionId);
    if (existing) {
      existing.answerOptionIds = request.answerOptionIds;
      existing.textAnswer = request.textAnswer;
      existing.updatedAt = this.now();
      return existing;
    }
    const answer: AttemptAnswer = { id: this.id('answer'), tenantId, attemptId, questionId: request.questionId, answerOptionIds: request.answerOptionIds, textAnswer: request.textAnswer, status: 'active', createdAt: this.now(), updatedAt: this.now() };
    this.attemptAnswers.push(answer);
    this.audit(tenantId, actorId, 'assessment.answer_saved', 'assessment.attempt_answer', answer.id, undefined, answer, context);
    return answer;
  }
  submitAttempt(tenantId: string, actorId: string | undefined, id: string, context: RequestContext): Attempt {
    const attempt = this.getById(this.attempts, tenantId, id);
    if (['submitted', 'finished', 'expired', 'invalidated'].includes(attempt.status)) return attempt;
    if (attempt.expiresAt && new Date(attempt.expiresAt).getTime() < Date.now()) {
      attempt.status = 'expired';
      attempt.finishedAt = this.now();
      return attempt;
    }
    attempt.status = 'submitted';
    attempt.submittedAt = this.now();
    const scores = this.calculateAttemptScore(tenantId, attempt.id);
    attempt.score = scores.score;
    attempt.maxScore = scores.maxScore;
    attempt.passed = scores.score >= scores.passingScore;
    attempt.updatedAt = this.now();
    this.finalizeAttempt(tenantId, actorId, attempt.id, context);
    return attempt;
  }
  finishAttempt(tenantId: string, actorId: string | undefined, id: string, context: RequestContext): Attempt {
    return this.finalizeAttempt(tenantId, actorId, id, context);
  }
  getAttemptResult(tenantId: string, id: string): ExamResult {
    const attempt = this.getById(this.attempts, tenantId, id);
    return this.recalculateExamResult(tenantId, attempt.testId, attempt.enrollmentId, attempt.learnerId);
  }
  createAnswer(tenantId: string, actorId: string | undefined, request: { attemptId: string } & SaveAnswerRequest, context: RequestContext): AttemptAnswer {
    return this.saveAttemptAnswer(tenantId, actorId, request.attemptId, request, context);
  }
  patchAnswer(tenantId: string, actorId: string | undefined, id: string, request: SaveAnswerRequest, context: RequestContext): AttemptAnswer {
    const answer = this.getById(this.attemptAnswers, tenantId, id);
    return this.saveAttemptAnswer(tenantId, actorId, answer.attemptId, request, context);
  }

  listExamResults(tenantId: string, query: BaseFilterQuery): ListResponse<ExamResult> { return this.list(this.examResults, tenantId, query); }
  getExamResult(tenantId: string, id: string): ExamResult { return this.getById(this.examResults, tenantId, id); }
  getExamResultByEnrollment(tenantId: string, enrollmentId: string): ExamResult[] {
    return this.examResults.filter((item) => item.tenantId === tenantId && item.enrollmentId === enrollmentId);
  }
  recalculateExamResults(tenantId: string): { count: number } {
    const grouped = new Map<string, { testId: string; enrollmentId: string; learnerId: string }>();
    this.attempts.filter((item) => item.tenantId === tenantId).forEach((item) => grouped.set(`${item.testId}:${item.enrollmentId}:${item.learnerId}`, item));
    grouped.forEach((item) => this.recalculateExamResult(tenantId, item.testId, item.enrollmentId, item.learnerId));
    return { count: grouped.size };
  }

  listAssignments(tenantId: string, query: BaseFilterQuery): ListResponse<Assignment> { return this.list(this.assignments, tenantId, query); }
  getAssignment(tenantId: string, id: string): Assignment { return this.getById(this.assignments, tenantId, id); }
  createAssignment(tenantId: string, actorId: string | undefined, request: CreateAssignmentRequest, context: RequestContext): Assignment {
    this.getById(this.courses, tenantId, request.courseId);
    if (request.moduleId) this.getById(this.modules, tenantId, request.moduleId);
    const assignment: Assignment = { id: this.id('asg'), tenantId, courseId: request.courseId, moduleId: request.moduleId, title: request.title, description: request.description, isReviewRequired: request.isReviewRequired ?? true, maxScore: request.maxScore ?? 100, status: 'draft', createdAt: this.now(), updatedAt: this.now() };
    this.assignments.push(assignment);
    this.audit(tenantId, actorId, 'assessment.assignment_created', 'assessment.assignment', assignment.id, undefined, assignment, context);
    return assignment;
  }
  updateAssignment(tenantId: string, actorId: string | undefined, id: string, request: UpdateAssignmentRequest, context: RequestContext): Assignment {
    const assignment = this.getById(this.assignments, tenantId, id);
    Object.assign(assignment, request, { updatedAt: this.now() });
    this.audit(tenantId, actorId, 'assessment.assignment_updated', 'assessment.assignment', assignment.id, undefined, assignment, context);
    return assignment;
  }
  publishAssignment(tenantId: string, actorId: string | undefined, id: string, context: RequestContext): Assignment {
    const assignment = this.getById(this.assignments, tenantId, id);
    assignment.status = 'published';
    assignment.publishedAt = this.now();
    return assignment;
  }
  archiveAssignment(tenantId: string, actorId: string | undefined, id: string, context: RequestContext): Assignment {
    const assignment = this.getById(this.assignments, tenantId, id);
    assignment.status = 'archived';
    assignment.archivedAt = this.now();
    return assignment;
  }

  listAssignmentSubmissions(tenantId: string, query: BaseFilterQuery): ListResponse<AssignmentSubmission> { return this.list(this.assignmentSubmissions, tenantId, query); }
  getAssignmentSubmission(tenantId: string, id: string): AssignmentSubmission { return this.getById(this.assignmentSubmissions, tenantId, id); }
  createAssignmentSubmission(tenantId: string, actorId: string | undefined, request: CreateAssignmentSubmissionRequest, context: RequestContext): AssignmentSubmission {
    this.getById(this.assignments, tenantId, request.assignmentId);
    this.getById(this.enrollments, tenantId, request.enrollmentId);
    const submission: AssignmentSubmission = { id: this.id('subm'), tenantId, assignmentId: request.assignmentId, enrollmentId: request.enrollmentId, learnerId: request.learnerId, textAnswer: request.textAnswer, fileId: request.fileId, status: 'draft', createdAt: this.now(), updatedAt: this.now() };
    this.assignmentSubmissions.push(submission);
    return submission;
  }
  updateAssignmentSubmission(tenantId: string, actorId: string | undefined, id: string, request: UpdateAssignmentSubmissionRequest): AssignmentSubmission {
    const submission = this.getById(this.assignmentSubmissions, tenantId, id);
    if (['submitted', 'under_review', 'reviewed', 'rejected'].includes(submission.status)) throw new PreconditionFailedException({ code: 'submission_locked', message: 'Submitted assignment cannot be edited' });
    Object.assign(submission, request, { updatedAt: this.now() });
    return submission;
  }
  submitAssignmentSubmission(tenantId: string, actorId: string | undefined, id: string, context: RequestContext): AssignmentSubmission {
    const submission = this.getById(this.assignmentSubmissions, tenantId, id);
    if (submission.status === 'submitted') return submission;
    submission.status = 'submitted';
    submission.submittedAt = this.now();
    this.audit(tenantId, actorId, 'assessment.assignment_submission_submitted', 'assessment.assignment_submission', submission.id, undefined, submission, context);
    return submission;
  }

  listAssignmentReviews(tenantId: string, query: BaseFilterQuery): ListResponse<AssignmentReview> { return this.list(this.assignmentReviews, tenantId, query); }
  getAssignmentReview(tenantId: string, id: string): AssignmentReview { return this.getById(this.assignmentReviews, tenantId, id); }
  createAssignmentReview(tenantId: string, actorId: string | undefined, request: CreateAssignmentReviewRequest): AssignmentReview {
    const submission = this.getById(this.assignmentSubmissions, tenantId, request.submissionId);
    const assignment = this.getById(this.assignments, tenantId, submission.assignmentId);
    submission.status = 'under_review';
    const review: AssignmentReview = { id: this.id('rev'), tenantId, assignmentId: assignment.id, submissionId: submission.id, enrollmentId: submission.enrollmentId, reviewerId: actorId ?? 'system', score: request.score, comment: request.comment, reviewStatus: 'in_review', status: 'active', createdAt: this.now(), updatedAt: this.now() };
    this.assignmentReviews.push(review);
    return review;
  }
  updateAssignmentReview(tenantId: string, actorId: string | undefined, id: string, request: UpdateAssignmentReviewRequest): AssignmentReview {
    const review = this.getById(this.assignmentReviews, tenantId, id);
    Object.assign(review, request, { updatedAt: this.now() });
    return review;
  }
  completeAssignmentReview(tenantId: string, actorId: string | undefined, id: string, context: RequestContext): AssignmentReview {
    const review = this.getById(this.assignmentReviews, tenantId, id);
    review.reviewStatus = 'completed';
    review.completedAt = this.now();
    const submission = this.getById(this.assignmentSubmissions, tenantId, review.submissionId);
    submission.status = 'reviewed';
    this.audit(tenantId, actorId, 'assessment.assignment_review_completed', 'assessment.assignment_review', review.id, undefined, review, context);
    return review;
  }

  private recalculateModuleProgress(tenantId: string, enrollmentId: string, moduleId: string, courseId: string): void {
    const moduleMaterials = this.materialProgress.filter((item) => item.tenantId === tenantId && item.enrollmentId === enrollmentId && item.moduleId === moduleId);
    const requiredSeconds = moduleMaterials.reduce((acc, item) => acc + item.requiredSeconds, 0);
    const studiedSeconds = moduleMaterials.reduce((acc, item) => acc + item.studiedSeconds, 0);
    const ratio = requiredSeconds === 0 ? 1 : Math.min(1, studiedSeconds / requiredSeconds);
    const progressPercent = this.normalizePercent(ratio * 100);
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
    record.calculatedAt = now;
    record.updatedAt = now;
    record.completedAt = status === 'completed' ? now : undefined;
    if (!existing) this.moduleProgress.push(record);
  }

  private recalculateCourseProgress(tenantId: string, enrollmentId: string, courseId: string): void {
    const moduleProgress = this.moduleProgress.filter((item) => item.tenantId === tenantId && item.enrollmentId === enrollmentId && item.courseId === courseId);
    const requiredSeconds = moduleProgress.reduce((acc, item) => acc + item.requiredSeconds, 0);
    const studiedSeconds = moduleProgress.reduce((acc, item) => acc + item.studiedSeconds, 0);
    const ratio = requiredSeconds === 0 ? 1 : Math.min(1, studiedSeconds / requiredSeconds);
    const progressPercent = this.normalizePercent(ratio * 100);
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
    record.calculatedAt = now;
    record.updatedAt = now;
    record.completedAt = status === 'completed' ? now : undefined;
    if (!existing) this.courseProgress.push(record);
  }



  listQuestionBanks(tenantId: string, query: BaseFilterQuery): ListResponse<QuestionBank> { return this.list(this.questionBanks, tenantId, query); }
  getQuestionBank(tenantId: string, id: string): QuestionBank { return this.getById(this.questionBanks, tenantId, id); }
  createQuestionBank(tenantId: string, actorId: string | undefined, request: CreateQuestionBankRequest, context: RequestContext): QuestionBank {
    const entity: QuestionBank = { id: this.id('qbank'), tenantId, code: request.code, title: request.title, description: request.description, isArchived: false, status: 'draft', createdAt: this.now(), updatedAt: this.now() };
    this.questionBanks.push(entity);
    this.audit(tenantId, actorId, 'assessment.question_bank_created', 'assessment.question_bank', entity.id, undefined, entity, context);
    return entity;
  }
  updateQuestionBank(tenantId: string, actorId: string | undefined, id: string, request: UpdateQuestionBankRequest, context: RequestContext): QuestionBank {
    const current = this.getById(this.questionBanks, tenantId, id);
    const oldValues = { ...current };
    Object.assign(current, request, { updatedAt: this.now() });
    this.audit(tenantId, actorId, 'assessment.question_bank_updated', 'assessment.question_bank', current.id, oldValues, current, context);
    return current;
  }
  archiveQuestionBank(tenantId: string, actorId: string | undefined, id: string, context: RequestContext): QuestionBank {
    const current = this.getById(this.questionBanks, tenantId, id);
    current.status = 'archived';
    current.isArchived = true;
    current.updatedAt = this.now();
    this.audit(tenantId, actorId, 'assessment.question_bank_archived', 'assessment.question_bank', current.id, undefined, current, context);
    return current;
  }

  listQuestions(tenantId: string, query: BaseFilterQuery): ListResponse<Question> { return this.list(this.questions, tenantId, query); }
  getQuestion(tenantId: string, id: string): Question { return this.getById(this.questions, tenantId, id); }
  listQuestionBankQuestions(tenantId: string, questionBankId: string, query: BaseFilterQuery): ListResponse<Question> {
    this.getById(this.questionBanks, tenantId, questionBankId);
    return this.list(this.questions.filter((item) => item.questionBankId === questionBankId), tenantId, query);
  }
  createQuestion(tenantId: string, actorId: string | undefined, request: CreateQuestionRequest, context: RequestContext): Question {
    this.getById(this.questionBanks, tenantId, request.questionBankId);
    const entity: Question = { id: this.id('q'), tenantId, questionBankId: request.questionBankId, type: request.type, title: request.title, body: request.body, score: request.score, isArchived: false, status: 'active', createdAt: this.now(), updatedAt: this.now() };
    this.questions.push(entity);
    if (request.answerOptions?.length) {
      request.answerOptions.forEach((option, idx) => this.answerOptions.push({ id: this.id('opt'), tenantId, questionId: entity.id, text: option.text, isCorrect: option.isCorrect, sortOrder: idx, status: 'active', createdAt: this.now(), updatedAt: this.now() }));
    }
    this.audit(tenantId, actorId, 'assessment.question_created', 'assessment.question', entity.id, undefined, entity, context);
    return entity;
  }
  updateQuestion(tenantId: string, actorId: string | undefined, id: string, request: UpdateQuestionRequest, context: RequestContext): Question {
    const current = this.getById(this.questions, tenantId, id);
    if (current.isArchived) throw new PreconditionFailedException({ code: 'domain_rule_violation', message: 'Archived question is read-only' });
    const oldValues = { ...current };
    Object.assign(current, request, { updatedAt: this.now() });
    if (request.answerOptions) {
      this.answerOptions = this.answerOptions.filter((item) => !(item.tenantId === tenantId && item.questionId === id));
      request.answerOptions.forEach((option, idx) => this.answerOptions.push({ id: this.id('opt'), tenantId, questionId: id, text: option.text, isCorrect: option.isCorrect, sortOrder: idx, status: 'active', createdAt: this.now(), updatedAt: this.now() }));
    }
    this.audit(tenantId, actorId, 'assessment.question_updated', 'assessment.question', current.id, oldValues, current, context);
    return current;
  }
  archiveQuestion(tenantId: string, actorId: string | undefined, id: string, context: RequestContext): Question {
    const current = this.getById(this.questions, tenantId, id);
    current.status = 'archived';
    current.isArchived = true;
    current.updatedAt = this.now();
    this.audit(tenantId, actorId, 'assessment.question_archived', 'assessment.question', current.id, undefined, current, context);
    return current;
  }

  listTests(tenantId: string, query: BaseFilterQuery): ListResponse<TestEntity> { return this.list(this.tests, tenantId, query); }
  getTest(tenantId: string, id: string): TestEntity { return this.getById(this.tests, tenantId, id); }
  createTest(tenantId: string, actorId: string | undefined, request: CreateTestRequest, context: RequestContext): TestEntity {
    this.getById(this.courses, tenantId, request.courseId);
    const entity: TestEntity = { id: this.id('test'), tenantId, courseId: request.courseId, title: request.title, description: request.description, questionBankId: request.questionBankId, rules: request.rules, isArchived: false, status: 'draft', createdAt: this.now(), updatedAt: this.now() };
    this.tests.push(entity);
    this.audit(tenantId, actorId, 'assessment.test_created', 'assessment.test', entity.id, undefined, entity, context);
    return entity;
  }
  updateTest(tenantId: string, actorId: string | undefined, id: string, request: UpdateTestRequest, context: RequestContext): TestEntity {
    const current = this.getById(this.tests, tenantId, id);
    const oldValues = { ...current };
    Object.assign(current, request, { updatedAt: this.now() });
    this.audit(tenantId, actorId, 'assessment.test_updated', 'assessment.test', current.id, oldValues, current, context);
    return current;
  }
  publishTest(tenantId: string, actorId: string | undefined, id: string, context: RequestContext): TestEntity {
    const current = this.getById(this.tests, tenantId, id);
    current.status = 'published';
    current.updatedAt = this.now();
    this.audit(tenantId, actorId, 'assessment.test_published', 'assessment.test', current.id, undefined, current, context);
    return current;
  }
  archiveTest(tenantId: string, actorId: string | undefined, id: string, context: RequestContext): TestEntity {
    const current = this.getById(this.tests, tenantId, id);
    current.status = 'archived';
    current.isArchived = true;
    current.updatedAt = this.now();
    this.audit(tenantId, actorId, 'assessment.test_archived', 'assessment.test', current.id, undefined, current, context);
    return current;
  }
  patchTestRules(tenantId: string, actorId: string | undefined, id: string, request: PatchTestRulesRequest, context: RequestContext): TestEntity {
    const current = this.getById(this.tests, tenantId, id);
    current.rules = { ...request };
    current.updatedAt = this.now();
    this.audit(tenantId, actorId, 'assessment.test_rules_updated', 'assessment.test', current.id, undefined, current, context);
    return current;
  }
  listTestQuestions(tenantId: string, testId: string): TestQuestion[] {
    this.getById(this.tests, tenantId, testId);
    return this.testQuestions.filter((item) => item.tenantId === tenantId && item.testId === testId);
  }
  addTestQuestions(tenantId: string, actorId: string | undefined, testId: string, questionIds: string[], context: RequestContext): TestQuestion[] {
    this.getById(this.tests, tenantId, testId);
    questionIds.forEach((questionId) => this.getById(this.questions, tenantId, questionId));
    questionIds.forEach((questionId) => {
      if (!this.testQuestions.some((item) => item.tenantId === tenantId && item.testId === testId && item.questionId === questionId)) {
        this.testQuestions.push({ id: this.id('tq'), tenantId, testId, questionId, sortOrder: this.testQuestions.length, status: 'active', createdAt: this.now(), updatedAt: this.now() });
      }
    });
    this.audit(tenantId, actorId, 'assessment.test_questions_attached', 'assessment.test', testId, undefined, { testId, questionIds }, context);
    return this.listTestQuestions(tenantId, testId);
  }

  listAttempts(tenantId: string, query: BaseFilterQuery): ListResponse<TestAttempt> { return this.list(this.attempts, tenantId, query); }
  getAttempt(tenantId: string, id: string): TestAttempt { return this.getById(this.attempts, tenantId, id); }
  startAttempt(tenantId: string, actorId: string | undefined, request: StartAttemptRequest, context: RequestContext): TestAttempt {
    const test = this.getById(this.tests, tenantId, request.testId);
    const enrollment = this.getById(this.enrollments, tenantId, request.enrollmentId);
    const learnerId = enrollment.learnerId;
    const now = new Date(this.now());
    const dayKey = now.toISOString().slice(0, 10);
    const attempts = this.attempts.filter((item) => item.tenantId === tenantId && item.testId === request.testId && item.learnerId === learnerId);
    const bounded = test.rules.dailyResetEnabled ? attempts.filter((item) => item.startedAt.slice(0, 10) === dayKey) : attempts;
    if (bounded.length >= test.rules.attemptLimit) throw new PreconditionFailedException({ code: 'attempt_limit_reached', message: 'Attempt limit reached' });
    const questionPool = this.listTestQuestions(tenantId, request.testId).map((item) => item.questionId);
    const ordered = [...questionPool];
    if (test.rules.randomizeQuestions) ordered.sort(() => Math.random() - 0.5);
    const snapshot = test.rules.questionCount ? ordered.slice(0, test.rules.questionCount) : ordered;
    const maxScore = snapshot.reduce((acc, questionId) => acc + this.getById(this.questions, tenantId, questionId).score, 0);
    const startedAt = now.toISOString();
    const expiresAt = test.rules.timeLimitMinutes ? new Date(now.getTime() + (test.rules.timeLimitMinutes * 60000)).toISOString() : undefined;
    const entity: TestAttempt = { id: this.id('attempt'), tenantId, testId: request.testId, enrollmentId: request.enrollmentId, learnerId, attemptNo: attempts.length + 1, status: 'in_progress', startedAt, expiresAt, score: 0, maxScore, questionOrder: snapshot, createdAt: startedAt, updatedAt: startedAt };
    this.attempts.push(entity);
    this.audit(tenantId, actorId, 'assessment.attempt_started', 'assessment.test_attempt', entity.id, undefined, entity, context);
    return entity;
  }
  saveAnswer(tenantId: string, actorId: string | undefined, attemptId: string, request: SaveAttemptAnswerRequest, context: RequestContext): AttemptAnswer {
    const attempt = this.getById(this.attempts, tenantId, attemptId);
    if (!['draft', 'in_progress'].includes(attempt.status)) throw new PreconditionFailedException({ code: 'attempt_terminal', message: 'Cannot update answers in terminal state' });
    if (attempt.expiresAt && new Date(attempt.expiresAt) <= new Date()) { attempt.status = 'expired'; throw new PreconditionFailedException({ code: 'attempt_expired', message: 'Attempt expired' }); }
    if (!attempt.questionOrder.includes(request.questionId)) throw new BadRequestException({ code: 'domain_rule_violation', message: 'Question is not part of attempt snapshot' });
    const existing = this.attemptAnswers.find((item) => item.tenantId === tenantId && item.attemptId === attemptId && item.questionId === request.questionId);
    const answer = existing ?? { id: this.id('ans'), tenantId, attemptId, questionId: request.questionId, status: 'active', createdAt: this.now(), updatedAt: this.now() };
    answer.selectedOptionIds = request.selectedOptionIds;
    answer.textAnswer = request.textAnswer;
    answer.updatedAt = this.now();
    if (!existing) this.attemptAnswers.push(answer);
    this.audit(tenantId, actorId, 'assessment.answer_saved', 'assessment.attempt_answer', answer.id, undefined, answer, context);
    return answer;
  }
  submitAttempt(tenantId: string, actorId: string | undefined, attemptId: string, context: RequestContext): TestAttempt {
    const attempt = this.getById(this.attempts, tenantId, attemptId);
    if (['submitted', 'finished', 'expired', 'invalidated'].includes(attempt.status)) return attempt;
    if (attempt.expiresAt && new Date(attempt.expiresAt) <= new Date()) attempt.status = 'expired';
    const test = this.getById(this.tests, tenantId, attempt.testId);
    const answers = this.attemptAnswers.filter((item) => item.tenantId === tenantId && item.attemptId === attempt.id);
    let score = 0;
    for (const qid of attempt.questionOrder) {
      const question = this.getById(this.questions, tenantId, qid);
      const answer = answers.find((item) => item.questionId === qid);
      if (!answer) continue;
      if (question.type === 'text') continue;
      const correct = this.answerOptions.filter((item) => item.tenantId === tenantId && item.questionId === qid && item.isCorrect).map((item) => item.id).sort();
      const selected = [...(answer.selectedOptionIds ?? [])].sort();
      if (JSON.stringify(correct) === JSON.stringify(selected)) score += question.score;
    }
    attempt.score = score;
    attempt.passed = score >= test.rules.passingScore;
    attempt.status = 'submitted';
    attempt.submittedAt = this.now();
    attempt.updatedAt = this.now();
    this.finalizeExamResult(tenantId, actorId, attempt, context);
    this.audit(tenantId, actorId, 'assessment.attempt_submitted', 'assessment.test_attempt', attempt.id, undefined, attempt, context);
    return attempt;
  }
  finishAttempt(tenantId: string, actorId: string | undefined, attemptId: string, context: RequestContext): TestAttempt {
    const submitted = this.submitAttempt(tenantId, actorId, attemptId, context);
    submitted.status = 'finished';
    submitted.finishedAt = this.now();
    submitted.updatedAt = this.now();
    this.audit(tenantId, actorId, 'assessment.attempt_finished', 'assessment.test_attempt', submitted.id, undefined, submitted, context);
    return submitted;
  }

  listExamResults(tenantId: string, query: BaseFilterQuery): ListResponse<ExamResult> { return this.list(this.examResults, tenantId, query); }
  getExamResult(tenantId: string, id: string): ExamResult { return this.getById(this.examResults, tenantId, id); }
  getExamResultByEnrollment(tenantId: string, enrollmentId: string): ExamResult[] {
    return this.examResults.filter((item) => item.tenantId === tenantId && item.enrollmentId === enrollmentId);
  }
  private finalizeExamResult(tenantId: string, actorId: string | undefined, attempt: TestAttempt, context: RequestContext): void {
    const existing = this.examResults.find((item) => item.tenantId === tenantId && item.enrollmentId === attempt.enrollmentId && item.testId === attempt.testId);
    const attempts = this.attempts.filter((item) => item.tenantId === tenantId && item.enrollmentId === attempt.enrollmentId && item.testId === attempt.testId && ['submitted','finished'].includes(item.status));
    const best = attempts.sort((a,b) => (b.score ?? 0) - (a.score ?? 0))[0] ?? attempt;
    const test = this.getById(this.tests, tenantId, attempt.testId);
    if (existing) {
      existing.bestAttemptId = best.id;
      existing.attemptsCount = attempts.length;
      existing.finalScore = best.score ?? 0;
      existing.maxScore = best.maxScore;
      existing.passed = (best.score ?? 0) >= test.rules.passingScore;
      existing.updatedAt = this.now();
      this.audit(tenantId, actorId, 'assessment.exam_result_finalized', 'assessment.exam_result', existing.id, undefined, existing, context);
      return;
    }
    const entity: ExamResult = { id: this.id('result'), tenantId, enrollmentId: attempt.enrollmentId, learnerId: attempt.learnerId, testId: attempt.testId, bestAttemptId: best.id, attemptsCount: attempts.length, finalScore: best.score ?? 0, maxScore: best.maxScore, passed: (best.score ?? 0) >= test.rules.passingScore, status: 'final', createdAt: this.now(), updatedAt: this.now() };
    this.examResults.push(entity);
    this.audit(tenantId, actorId, 'assessment.exam_result_finalized', 'assessment.exam_result', entity.id, undefined, entity, context);
  }

  listAssignments(tenantId: string, query: BaseFilterQuery): ListResponse<Assignment> { return this.list(this.assignments, tenantId, query); }
  getAssignment(tenantId: string, id: string): Assignment { return this.getById(this.assignments, tenantId, id); }
  createAssignment(tenantId: string, actorId: string | undefined, request: CreateAssignmentRequest, context: RequestContext): Assignment {
    const entity: Assignment = { id: this.id('asn'), tenantId, courseId: request.courseId, moduleId: request.moduleId, title: request.title, description: request.description, maxScore: request.maxScore, isReviewRequired: request.isReviewRequired ?? true, isArchived: false, status: 'draft', createdAt: this.now(), updatedAt: this.now() };
    this.assignments.push(entity);
    this.audit(tenantId, actorId, 'assessment.assignment_created', 'assessment.assignment', entity.id, undefined, entity, context);
    return entity;
  }
  updateAssignment(tenantId: string, actorId: string | undefined, id: string, request: UpdateAssignmentRequest, context: RequestContext): Assignment {
    const current = this.getById(this.assignments, tenantId, id);
    const oldValues = { ...current };
    Object.assign(current, request, { updatedAt: this.now() });
    this.audit(tenantId, actorId, 'assessment.assignment_updated', 'assessment.assignment', current.id, oldValues, current, context);
    return current;
  }
  publishAssignment(tenantId: string, actorId: string | undefined, id: string, context: RequestContext): Assignment {
    const current = this.getById(this.assignments, tenantId, id);
    current.status = 'published';
    current.updatedAt = this.now();
    return current;
  }
  archiveAssignment(tenantId: string, actorId: string | undefined, id: string, context: RequestContext): Assignment {
    const current = this.getById(this.assignments, tenantId, id);
    current.status = 'archived';
    current.isArchived = true;
    current.updatedAt = this.now();
    return current;
  }
  listAssignmentSubmissions(tenantId: string, query: BaseFilterQuery): ListResponse<AssignmentSubmission> { return this.list(this.assignmentSubmissions, tenantId, query); }
  getAssignmentSubmission(tenantId: string, id: string): AssignmentSubmission { return this.getById(this.assignmentSubmissions, tenantId, id); }
  createAssignmentSubmission(tenantId: string, actorId: string | undefined, request: CreateAssignmentSubmissionRequest, context: RequestContext): AssignmentSubmission {
    const enrollment = this.getById(this.enrollments, tenantId, request.enrollmentId);
    const submission: AssignmentSubmission = { id: this.id('subm'), tenantId, assignmentId: request.assignmentId, enrollmentId: request.enrollmentId, learnerId: enrollment.learnerId, answerText: request.answerText, fileId: request.fileId, status: 'draft', createdAt: this.now(), updatedAt: this.now() };
    this.assignmentSubmissions.push(submission);
    return submission;
  }
  updateAssignmentSubmission(tenantId: string, actorId: string | undefined, id: string, request: UpdateAssignmentSubmissionRequest, context: RequestContext): AssignmentSubmission {
    const current = this.getById(this.assignmentSubmissions, tenantId, id);
    if (['submitted','under_review','reviewed','rejected'].includes(current.status)) throw new PreconditionFailedException({ code: 'submission_terminal', message: 'Submission is not editable' });
    Object.assign(current, request, { updatedAt: this.now() });
    return current;
  }
  submitAssignmentSubmission(tenantId: string, actorId: string | undefined, id: string, context: RequestContext): AssignmentSubmission {
    const current = this.getById(this.assignmentSubmissions, tenantId, id);
    if (['submitted','under_review','reviewed'].includes(current.status)) return current;
    current.status = 'submitted';
    current.submittedAt = this.now();
    current.updatedAt = this.now();
    this.audit(tenantId, actorId, 'assessment.assignment_submission_submitted', 'assessment.assignment_submission', current.id, undefined, current, context);
    return current;
  }
  listAssignmentReviews(tenantId: string, query: BaseFilterQuery): ListResponse<AssignmentReview> { return this.list(this.assignmentReviews, tenantId, query); }
  getAssignmentReview(tenantId: string, id: string): AssignmentReview { return this.getById(this.assignmentReviews, tenantId, id); }
  createAssignmentReview(tenantId: string, actorId: string | undefined, request: CreateAssignmentReviewRequest, context: RequestContext): AssignmentReview {
    const submission = this.getById(this.assignmentSubmissions, tenantId, request.submissionId);
    submission.status = 'under_review';
    const review: AssignmentReview = { id: this.id('rev'), tenantId, assignmentId: submission.assignmentId, submissionId: submission.id, enrollmentId: submission.enrollmentId, reviewerId: actorId ?? 'unknown', score: request.score, comment: request.comment, status: 'in_review', createdAt: this.now(), updatedAt: this.now() };
    this.assignmentReviews.push(review);
    return review;
  }
  completeAssignmentReview(tenantId: string, actorId: string | undefined, id: string, request: { score?: number; comment?: string }, context: RequestContext): AssignmentReview {
    const review = this.getById(this.assignmentReviews, tenantId, id);
    review.score = request.score ?? review.score;
    review.comment = request.comment ?? review.comment;
    review.status = 'completed';
    review.completedAt = this.now();
    review.updatedAt = this.now();
    const submission = this.getById(this.assignmentSubmissions, tenantId, review.submissionId);
    submission.status = 'reviewed';
    submission.updatedAt = this.now();
    this.audit(tenantId, actorId, 'assessment.assignment_review_completed', 'assessment.assignment_review', review.id, undefined, review, context);
    return review;
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
    const linked = this.testQuestions
      .filter((item) => item.tenantId === tenantId && item.testId === test.id)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((item) => item.questionId);
    const bankIds = test.questionBankId
      ? this.questions.filter((item) => item.tenantId === tenantId && item.questionBankId === test.questionBankId).map((item) => item.id)
      : [];
    let ids = linked.length ? linked : bankIds;
    if (test.rules.randomizeQuestions) ids = [...ids].sort(() => Math.random() - 0.5);
    if (test.rules.questionCount && test.rules.questionCount > 0) ids = ids.slice(0, test.rules.questionCount);
    return ids;
  }

  private assertAttemptWritable(attempt: Attempt): void {
    if (attempt.expiresAt && new Date(attempt.expiresAt).getTime() < Date.now()) {
      attempt.status = 'expired';
      attempt.finishedAt = this.now();
    }
    if (['submitted', 'finished', 'expired', 'invalidated'].includes(attempt.status)) {
      throw new PreconditionFailedException({ code: 'attempt_readonly', message: 'Attempt is in terminal state' });
    }
  }

  private calculateAttemptScore(tenantId: string, attemptId: string): { score: number; maxScore: number; passingScore: number } {
    const attempt = this.getById(this.attempts, tenantId, attemptId);
    const test = this.getById(this.tests, tenantId, attempt.testId);
    const questions = attempt.questionOrder.map((id) => this.getById(this.questions, tenantId, id));
    const answers = this.attemptAnswers.filter((item) => item.tenantId === tenantId && item.attemptId === attemptId);
    let score = 0;
    questions.forEach((question) => {
      const answer = answers.find((item) => item.questionId === question.id);
      const options = this.answerOptions.filter((item) => item.tenantId === tenantId && item.questionId === question.id);
      if (!answer) return;
      if (question.type === 'text') {
        if ((answer.textAnswer ?? '').trim().length > 0) score += question.maxScore;
        return;
      }
      const correctIds = options.filter((item) => item.isCorrect).map((item) => item.id).sort();
      const picked = [...(answer.answerOptionIds ?? [])].sort();
      if (JSON.stringify(correctIds) === JSON.stringify(picked)) score += question.maxScore;
    });
    return { score, maxScore: questions.reduce((acc, item) => acc + item.maxScore, 0), passingScore: test.rules.passingScore };
  }

  private finalizeAttempt(tenantId: string, actorId: string | undefined, id: string, context: RequestContext): Attempt {
    const attempt = this.getById(this.attempts, tenantId, id);
    if (attempt.status === 'finished') return attempt;
    if (attempt.status === 'in_progress') this.submitAttempt(tenantId, actorId, id, context);
    attempt.status = attempt.status === 'expired' ? 'expired' : 'finished';
    attempt.finishedAt = this.now();
    attempt.updatedAt = this.now();
    this.recalculateExamResult(tenantId, attempt.testId, attempt.enrollmentId, attempt.learnerId);
    this.audit(tenantId, actorId, 'assessment.attempt_finished', 'assessment.attempt', attempt.id, undefined, attempt, context);
    return attempt;
  }

  private recalculateExamResult(tenantId: string, testId: string, enrollmentId: string, learnerId: string): ExamResult {
    const attempts = this.attempts.filter((item) => item.tenantId === tenantId && item.testId === testId && item.enrollmentId === enrollmentId && item.learnerId === learnerId && item.status === 'finished');
    const best = [...attempts].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
    const test = this.getById(this.tests, tenantId, testId);
    const existing = this.examResults.find((item) => item.tenantId === tenantId && item.testId === testId && item.enrollmentId === enrollmentId && item.learnerId === learnerId);
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
    if (!existing) this.examResults.push(record);
    return record;
  }

  private dayBucket(enabled: boolean): string | undefined {
    if (!enabled) return undefined;
    return new Date().toISOString().slice(0, 10);
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
    if (query.group_id) {
      items = items.filter((item) => String((item as Record<string, unknown>).groupId ?? '') === query.group_id);
    }
    if (query.learner_id) {
      items = items.filter((item) => String((item as Record<string, unknown>).learnerId ?? '') === query.learner_id);
    }
    if (query.course_id) {
      items = items.filter((item) => String((item as Record<string, unknown>).courseId ?? '') === query.course_id);
    }
    if (query.course_version_id) {
      items = items.filter((item) => String((item as Record<string, unknown>).courseVersionId ?? '') === query.course_version_id);
    }
    if (query.module_id) {
      items = items.filter((item) => String((item as Record<string, unknown>).moduleId ?? '') === query.module_id);
    }
    if (query.test_id) {
      items = items.filter((item) => String((item as Record<string, unknown>).testId ?? '') === query.test_id);
    }
    if (query.enrollment_id) {
      items = items.filter((item) => String((item as Record<string, unknown>).enrollmentId ?? '') === query.enrollment_id);
    }
    if (query.assignment_id) {
      items = items.filter((item) => String((item as Record<string, unknown>).assignmentId ?? '') === query.assignment_id);
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
