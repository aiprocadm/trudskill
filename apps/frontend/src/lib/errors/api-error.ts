import { ApiErrorCodes, type ApiErrorResponse } from '@cdoprof/api-contracts';

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
  const envelope = payload as Partial<ApiErrorResponse> | undefined;
  const code = envelope?.error?.code ?? ApiErrorCodes.INTERNAL_ERROR;
  const requestId = envelope?.meta?.request_id;
  const details = envelope?.error?.details;

  return {
    status,
    code,
    message: envelope?.error?.message ?? fallbackMessage,
    ...(requestId ? { requestId } : {}),
    ...(details ? { details } : {}),
    isAuthError: status === 401
  };
};
