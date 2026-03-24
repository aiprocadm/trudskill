export const ApiErrorCodes = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  PRECONDITION_FAILED: 'PRECONDITION_FAILED',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR'
} as const;

export type ApiErrorCode = (typeof ApiErrorCodes)[keyof typeof ApiErrorCodes];

export interface ApiErrorDetail {
  field?: string;
  message: string;
  code?: string;
}

export interface ApiErrorResponse {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: ApiErrorDetail[];
  };
  meta: {
    request_id: string;
    timestamp: string;
  };
}
