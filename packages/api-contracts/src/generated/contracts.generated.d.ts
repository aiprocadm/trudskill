// AUTO-GENERATED FILE. DO NOT EDIT.
// SOURCE_SHA256: deba011d574f088ed03bf71cd1f777cffe530accb583eabd99a3d79cb483d841
export type GeneratedOpenApiVersion = 'v1';

export interface GeneratedClientConfig {
  baseUrl: string;
}

export type GeneratedApiPath =
  | '/health'
  | '/auth/login'
  | '/auth/refresh'
  | '/auth/logout'
  | '/auth/me'
  | '/auth/sessions'
  | '/auth/sessions/{id}'
  | '/courses'
  | '/courses/{id}'
  | '/courses/{id}/publish'
  | '/courses/{id}/archive'
  | '/enrollments'
  | '/enrollments/{id}'
  | '/enrollments/{id}/status'
  | '/question-banks'
  | '/tests'
  | '/tests/{id}'
  | '/tests/{id}/publish'
  | '/attempts/start'
  | '/attempts/{id}/answers'
  | '/attempts/{id}/submit'
  | '/attempts/{id}/result'
  | '/assignments'
  | '/assignments/{id}'
  | '/assignment-submissions'
  | '/assignment-submissions/{id}/submit'
  | '/assignment-reviews'
  | '/documents'
  | '/documents/{id}'
  | '/documents/generate'
  | '/documents/{id}/download'
  | '/files/{id}/download';

export interface GeneratedApiMeta {
  requestId: string;
  correlationId: string;
  timestamp: string;
}

export interface GeneratedApiResponseEnvelope<T> {
  data: T;
  meta: GeneratedApiMeta;
}

export interface GeneratedApiError {
  code: string;
  message: string;
  details?: Array<{ field?: string; message: string; code?: string }>;
}

export interface GeneratedErrorEnvelope {
  error: GeneratedApiError;
  meta: GeneratedApiMeta;
}

export interface GeneratedLoginRequest {
  login: string;
  password: string;
}

export interface GeneratedLogoutRequest {
  sessionId: string;
}

export interface GeneratedSessionDto {
  id: string;
  tenantId: string;
  userId: string;
  expiresAt: string;
  revokedAt?: string;
}

export interface GeneratedBaseFilterQuery {
  page?: number | undefined;
  page_size?: number | undefined;
  q?: string | undefined;
  status?: string | undefined;
  sort?: string | undefined;
  direction_id?: string | undefined;
  course_id?: string | undefined;
  course_version_id?: string | undefined;
  module_id?: string | undefined;
  group_id?: string | undefined;
  learner_id?: string | undefined;
}
