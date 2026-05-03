import { Injectable } from '@nestjs/common';

import type {
  AnswerOption,
  Assignment,
  AssignmentReview,
  AssignmentSubmission,
  AttemptAnswer,
  BulkEnrollmentIdempotencyRecord,
  Counterparty,
  Course,
  CourseModuleEntity,
  CourseProgress,
  CourseVersion,
  Direction,
  Enrollment,
  EnrollmentStatusHistory,
  ExamResult,
  GroupCourse,
  GroupEntity,
  Learner,
  Material,
  MaterialProgress,
  ModuleProgress,
  Question,
  QuestionBank,
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
}
