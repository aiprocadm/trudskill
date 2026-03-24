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
  return {
    status,
    code,
    message: envelope?.error?.message ?? fallbackMessage,
    requestId: envelope?.meta?.request_id,
    details: envelope?.error?.details,
    isAuthError: status === 401 || code === 'auth_required' || code === 'invalid_refresh'
  };
};
