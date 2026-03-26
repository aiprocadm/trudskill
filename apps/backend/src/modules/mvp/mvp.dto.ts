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
  code: string;
  title: string;
  description?: string;
}

export interface UpdateQuestionBankRequest {
  code?: string;
  title?: string;
  description?: string;
}

export interface CreateQuestionRequest {
  questionBankId: string;
  type: 'single_choice' | 'multiple_choice' | 'text';
  title: string;
  body: string;
  score: number;
  answerOptions?: Array<{ text: string; isCorrect: boolean }>;
}

export interface UpdateQuestionRequest {
  title?: string;
  body?: string;
  score?: number;
  status?: string;
  answerOptions?: Array<{ text: string; isCorrect: boolean }>;
}

export interface CreateTestRequest {
  courseId: string;
  title: string;
  description?: string;
  questionBankId?: string;
  rules: {
    attemptLimit: number;
    dailyResetEnabled: boolean;
    randomizeQuestions: boolean;
    questionCount?: number;
    timeLimitMinutes?: number;
    passingScore: number;
  };
}

export interface UpdateTestRequest {
  title?: string;
  description?: string;
  status?: string;
}

export interface PatchTestRulesRequest extends CreateTestRequest['rules'] {}

export interface StartAttemptRequest {
  testId: string;
  enrollmentId: string;
}

export interface SaveAttemptAnswerRequest {
  questionId: string;
  selectedOptionIds?: string[];
  textAnswer?: string;
}

export interface CreateAssignmentRequest {
  courseId: string;
  moduleId?: string;
  title: string;
  description?: string;
  maxScore: number;
  isReviewRequired?: boolean;
}

export interface UpdateAssignmentRequest {
  title?: string;
  description?: string;
  maxScore?: number;
  status?: string;
}

export interface CreateAssignmentSubmissionRequest {
  assignmentId: string;
  enrollmentId: string;
  answerText?: string;
  fileId?: string;
}

export interface UpdateAssignmentSubmissionRequest {
  answerText?: string;
  fileId?: string;
}

export interface CreateAssignmentReviewRequest {
  submissionId: string;
  score?: number;
  comment?: string;
}
