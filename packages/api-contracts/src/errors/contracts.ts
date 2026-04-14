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

// #region agent log
void fetch('http://127.0.0.1:7784/ingest/208359c6-33bf-4bcf-bd6c-d5a3e4d89734', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Debug-Session-Id': '940dad' },
  body: JSON.stringify({
    sessionId: '940dad',
    runId: 'pre-fix',
    hypothesisId: 'H1',
    location: 'packages/api-contracts/src/errors/contracts.ts:12',
    message: 'ApiErrorCodes exported values snapshot',
    data: { values: Object.values(ApiErrorCodes), keys: Object.keys(ApiErrorCodes) },
    timestamp: Date.now()
  })
}).catch(() => {});
// #endregion

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
