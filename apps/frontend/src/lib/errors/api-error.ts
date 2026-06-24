import {
  type ApiErrorResponse,
  BackendHttpErrorCodes,
  type HttpExceptionResponseJson
} from '@trudskill/api-contracts';

export interface NormalizedApiError {
  status: number;
  code: string;
  message: string;
  requestId?: string;
  details?: Array<{ field?: string; message: string; code?: string }>;
  isAuthError: boolean;
}

export const normalizeApiError = (
  status: number,
  payload: unknown,
  fallbackMessage = 'Unexpected API error'
): NormalizedApiError => {
  const envelope = payload as
    | Partial<ApiErrorResponse>
    | Partial<HttpExceptionResponseJson>
    | undefined;
  const code = envelope?.error?.code ?? BackendHttpErrorCodes.internal_error;
  const meta = envelope?.meta as { request_id?: string; requestId?: string } | undefined;
  const requestId = meta?.request_id ?? meta?.requestId;
  const rawDetails = envelope?.error?.details;
  const details = Array.isArray(rawDetails)
    ? (rawDetails as Array<{ field?: string; message: string; code?: string }>)
    : undefined;

  return {
    status,
    code,
    message: envelope?.error?.message ?? fallbackMessage,
    ...(requestId ? { requestId } : {}),
    ...(details?.length ? { details } : {}),
    isAuthError: status === 401
  };
};
