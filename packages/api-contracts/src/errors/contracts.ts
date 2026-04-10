export const ApiErrorCodes = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  PRECONDITION_FAILED: 'PRECONDITION_FAILED',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  /** Согласовано с HttpExceptionEnvelopeFilter для необработанных исключений. */
  internal_error_snake: 'internal_error'
} as const;

export type ApiErrorCode = (typeof ApiErrorCodes)[keyof typeof ApiErrorCodes];

export interface ApiErrorDetail {
  field?: string;
  message: string;
  code?: string;
}

export interface ErrorEnvelope<TCode extends ApiErrorCode = ApiErrorCode> {
  error: {
    code: TCode;
    message: string;
    details?: ApiErrorDetail[];
  };
  meta: {
    request_id: string;
    timestamp: string;
  };
}

export type ValidationErrorResponse = ErrorEnvelope<typeof ApiErrorCodes.VALIDATION_ERROR>;
export type ForbiddenErrorResponse = ErrorEnvelope<typeof ApiErrorCodes.FORBIDDEN>;
export type NotFoundErrorResponse = ErrorEnvelope<typeof ApiErrorCodes.NOT_FOUND>;
export type ConflictErrorResponse = ErrorEnvelope<typeof ApiErrorCodes.CONFLICT>;
export type PreconditionFailedErrorResponse = ErrorEnvelope<
  typeof ApiErrorCodes.PRECONDITION_FAILED
>;
export type RateLimitedErrorResponse = ErrorEnvelope<typeof ApiErrorCodes.RATE_LIMITED>;

export type ApiErrorResponse =
  | ValidationErrorResponse
  | ForbiddenErrorResponse
  | NotFoundErrorResponse
  | ConflictErrorResponse
  | PreconditionFailedErrorResponse
  | RateLimitedErrorResponse
  | ErrorEnvelope<typeof ApiErrorCodes.INTERNAL_ERROR>;
