import { Injectable } from '@nestjs/common';

import type { BulkImportIdempotencyRecord } from '../learners-bulk-import.types.js';
import type {
  AnswerOption,
  Assignment,
  AssignmentReview,
  AssignmentSubmission,
  AttemptAnswer,
  BulkEnrollmentIdempotencyRecord,
  Commission,
  CommissionMember,
  Counterparty,
  Course,
  CourseDocumentSetEntry,
  CourseModuleEntity,
  CourseProgress,
  CourseVersion,
  Direction,
  EisotTestingBatch,
  EisotTestingRecord,
  Enrollment,
  EnrollmentStatusHistory,
  ExamResult,
  FrdoRegistryBatch,
  FrdoRegistryRecord,
  GroupCourse,
  GroupEntity,
  IdentityVerification,
  Learner,
  Material,
  MaterialProgress,
  ModuleProgress,
  OtRegistryBatch,
  OtRegistryRecord,
  PreExamToken,
  ProctoringRecording,
  PushSubscription,
  Question,
  QuestionBank,
  ReportTemplate,
  RostechnadzorBatch,
  RostechnadzorRecord,
  ScormAttempt,
  ScormPackage,
  TestAttempt,
  TestEntity,
  TestQuestion
} from '../mvp.types.js';

@Injectable()
export class InMemoryMvpState {
  counterparties: Counterparty[] = [];
  learners: Learner[] = [];
  directions: Direction[] = [];
  courses: Course[] = [];
  courseVersions: CourseVersion[] = [];
  modules: CourseModuleEntity[] = [];
  materials: Material[] = [];
  groups: GroupEntity[] = [];
  groupCourses: GroupCourse[] = [];
  enrollments: Enrollment[] = [];
  enrollmentStatusHistory: EnrollmentStatusHistory[] = [];
  materialProgress: MaterialProgress[] = [];
  moduleProgress: ModuleProgress[] = [];
  courseProgress: CourseProgress[] = [];
  questionBanks: QuestionBank[] = [];
  questions: Question[] = [];
  answerOptions: AnswerOption[] = [];
  tests: TestEntity[] = [];
  testQuestions: TestQuestion[] = [];
  attempts: TestAttempt[] = [];
  attemptAnswers: AttemptAnswer[] = [];
  examResults: ExamResult[] = [];
  assignments: Assignment[] = [];
  assignmentSubmissions: AssignmentSubmission[] = [];
  assignmentReviews: AssignmentReview[] = [];
  /** Upserted записи идемпотентности массовых назначений (персистятся в MVP snapshot). */
  bulkEnrollmentIdempotency: BulkEnrollmentIdempotencyRecord[] = [];
  /** Phase 2 Plan A — idempotency для bulk-import учеников из Excel. */
  bulkImportIdempotency: BulkImportIdempotencyRecord[] = [];
  // Pillar A — Plan A collections (§5.2, §5.3)
  commissions: Commission[] = [];
  commissionMembers: CommissionMember[] = [];
  courseDocumentSets: CourseDocumentSetEntry[] = [];
  // Wave 1 Plan 2 — pre-exam identity tokens (Приказ №816); a consumed token is the verification record.
  preExamTokens: PreExamToken[] = [];
  // Phase 4 Plan A — documentary identity verification (selfie+passport); per-learner records.
  identityVerifications: IdentityVerification[] = [];
  // Phase 4 Plan B — proctoring recording sessions (webcam video of final exams).
  proctoringRecordings: ProctoringRecording[] = [];
  // Wave 2 — ОТ-реестр (Минтруд/ЕИСОТ): durable export batches + per-record set.
  otRegistryBatches: OtRegistryBatch[] = [];
  otRegistryRecords: OtRegistryRecord[] = [];
  frdoRegistryBatches: FrdoRegistryBatch[] = [];
  frdoRegistryRecords: FrdoRegistryRecord[] = [];
  // Wave 2 sub-goal C — ЕИСОТ «лица на тестирование»: durable roster batches + per-record set.
  eisotTestingBatches: EisotTestingBatch[] = [];
  eisotTestingRecords: EisotTestingRecord[] = [];
  // Phase 6 — Ростехнадзор (промышленная безопасность): durable export batches + records.
  rostechnadzorRegistryBatches: RostechnadzorBatch[] = [];
  rostechnadzorRegistryRecords: RostechnadzorRecord[] = [];
  // Phase 9 Plan A — SCORM: пакеты + cmi-прогресс учеников.
  scormPackages: ScormPackage[] = [];
  scormAttempts: ScormAttempt[] = [];
  // Phase 10 Track A — saved Excel report builder templates (tenant-level).
  reportTemplates: ReportTemplate[] = [];
  // Phase 10 Track C — web-push подписки браузеров пользователей.
  pushSubscriptions: PushSubscription[] = [];
}
