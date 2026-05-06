/**
 * Колбэк в backend после сообщения очереди `bulk_enrollment` (см. `MvpBulkEnqueueService`).
 * Вынесено из `main.ts` для регрессионных тестов контракта без RabbitMQ.
 */
export class NonRetryableJobError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NonRetryableJobError';
  }
}

export interface BulkEnrollmentJobEnvelope {
  readonly messageId: string;
  readonly tenantId: string;
  readonly payload: Record<string, unknown>;
  readonly correlation_id?: string;
}

export const BULK_ENROLLMENT_CALLBACK_PATH = '/api/v1/internal/worker/mvp/bulk-enrollments';

export function buildBulkEnrollmentCallbackUrl(backendPublicUrl: string): string {
  const base = backendPublicUrl.replace(/\/$/, '');
  return `${base}${BULK_ENROLLMENT_CALLBACK_PATH}`;
}

const NON_RETRYABLE_CALLBACK_CODES = new Set([
  'validation_error',
  'auth_required',
  'permission_denied',
  'forbidden',
  'worker_callback_disabled',
  'worker_callback_invalid'
]);

export async function invokeBackendBulkEnrollment(
  backendPublicUrl: string,
  callbackToken: string | undefined,
  envelope: BulkEnrollmentJobEnvelope,
  fetchFn: typeof fetch = globalThis.fetch
): Promise<void> {
  if (!callbackToken) {
    throw new NonRetryableJobError(
      'WORKER_CALLBACK_TOKEN is not set — cannot finalize bulk enrollment'
    );
  }
  const url = buildBulkEnrollmentCallbackUrl(backendPublicUrl);
  const payload = envelope.payload as {
    actorId?: string;
    idempotencyKey: string;
    groupId: string;
    learnerIds?: string[];
    organizationUnitId?: string;
  };
  const res = await fetchFn(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-worker-callback-token': callbackToken
    },
    body: JSON.stringify({
      tenantId: envelope.tenantId,
      requestId: envelope.messageId,
      correlationId: envelope.correlation_id,
      payload
    })
  });
  const text = await res.text();
  let bodyUnknown: unknown;
  try {
    bodyUnknown = text ? JSON.parse(text) : null;
  } catch {
    bodyUnknown = text;
  }
  const top = bodyUnknown as { data?: unknown; error?: { code?: string } } | null;

  if (!res.ok) {
    const errCode = top?.error?.code ? String(top.error.code) : '';
    if (NON_RETRYABLE_CALLBACK_CODES.has(errCode)) {
      throw new NonRetryableJobError(`bulk callback rejected: ${errCode || 'unknown'}`);
    }
    throw new Error(`bulk_enrollment callback failed http=${res.status} body=${String(text).slice(0, 500)}`);
  }
}
