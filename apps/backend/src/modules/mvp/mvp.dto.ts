export interface BaseFilterQuery {
  page?: number;
  page_size?: number;
  sort?: string;
  q?: string;
  status?: string;
  created_from?: string;
  created_to?: string;
  group_id?: string;
  learner_id?: string;
  course_id?: string;
  course_version_id?: string;
  module_id?: string;
  test_id?: string;
  enrollment_id?: string;
  assignment_id?: string;
}

export interface CreateSimpleRegistryRequest {
  code: string;
  name: string;
  status?: string;
}

export interface UpdateSimpleRegistryRequest {
  code?: string;
  name?: string;
  status?: string;
}

export interface CreateCourseRequest {
  code: string;
  title: string;
  description?: string;
}

export interface UpdateCourseRequest {
  title?: string;
  description?: string;
}

export interface CreateModuleRequest {
  courseVersionId: string;
  title: string;
  minViewSeconds?: number;
  isRequired?: boolean;
}

export interface UpdateModuleRequest {
  title?: string;
  minViewSeconds?: number;
  isRequired?: boolean;
  status?: string;
}

export interface CreateMaterialRequest {
  moduleId: string;
  title: string;
  materialType: 'file' | 'external_url' | 'text' | 'video';
  minViewSeconds?: number;
  isRequired?: boolean;
  fileId?: string;
}

export interface UpdateMaterialRequest {
  title?: string;
  materialType?: 'file' | 'external_url' | 'text' | 'video';
  minViewSeconds?: number;
  isRequired?: boolean;
  status?: string;
  fileId?: string;
}

export interface CreateGroupCourseRequest {
  groupId: string;
  courseId: string;
}

export interface CreateEnrollmentRequest {
  groupId: string;
  learnerId: string;
}

export interface UpdateEnrollmentStatusRequest {
  status: 'pending' | 'active' | 'suspended' | 'completed' | 'cancelled';
  reason?: string;
}

export interface UpdateMaterialProgressRequest {
  enrollmentId: string;
  studiedSeconds: number;
}

export interface CreateQuestionBankRequest {
  title: string;
  description?: string;
  courseId?: string;
}
export interface UpdateQuestionBankRequest {
  title?: string;
  description?: string;
  status?: string;
}

export interface CreateQuestionRequest {
  questionBankId: string;
  text: string;
  explanation?: string;
  type: 'single_choice' | 'multiple_choice' | 'text';
  maxScore?: number;
  options?: { text: string; isCorrect?: boolean }[];
}
export interface UpdateQuestionRequest {
  text?: string;
  explanation?: string;
  status?: string;
  maxScore?: number;
  options?: { text: string; isCorrect?: boolean }[];
}

export interface CreateTestRequest {
  title: string;
  courseId: string;
  questionBankId?: string;
  rules?: Partial<TestRulesDto>;
}
export interface UpdateTestRequest {
  title?: string;
  status?: string;
}
export interface TestRulesDto {
  attemptLimit: number;
  dailyResetEnabled: boolean;
  randomizeQuestions: boolean;
  questionCount?: number;
  timeLimitMinutes?: number;
  passingScore: number;
}

export interface StartAttemptRequest {
  testId: string;
  enrollmentId: string;
  learnerId: string;
}

export interface SaveAnswerRequest {
  questionId: string;
  answerOptionIds?: string[];
  textAnswer?: string;
}

export interface CreateAssignmentRequest {
  courseId: string;
  moduleId?: string;
  title: string;
  description?: string;
  isReviewRequired?: boolean;
  maxScore?: number;
}
export interface UpdateAssignmentRequest {
  title?: string;
  description?: string;
  status?: string;
  isReviewRequired?: boolean;
  maxScore?: number;
}

export interface CreateAssignmentSubmissionRequest {
  assignmentId: string;
  enrollmentId: string;
  learnerId: string;
  textAnswer?: string;
  fileId?: string;
}
export interface UpdateAssignmentSubmissionRequest {
  textAnswer?: string;
  fileId?: string;
}
export interface CreateAssignmentReviewRequest {
  submissionId: string;
  score?: number;
  comment?: string;
}
export interface UpdateAssignmentReviewRequest {
  score?: number;
  comment?: string;
  reviewStatus?: 'pending' | 'in_review' | 'completed';
}
