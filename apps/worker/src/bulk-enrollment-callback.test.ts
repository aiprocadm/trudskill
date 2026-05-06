import { describe, expect, it, vi } from 'vitest';

import {
  BULK_ENROLLMENT_CALLBACK_PATH,
  type BulkEnrollmentJobEnvelope,
  NonRetryableJobError,
  buildBulkEnrollmentCallbackUrl,
  invokeBackendBulkEnrollment
} from './bulk-enrollment-callback.js';

function demoEnvelope(): BulkEnrollmentJobEnvelope {
  return {
    messageId: 'mid-1',
    tenantId: 'tenant_demo',
    payload: {
      idempotencyKey: 'ik-1',
      groupId: 'grp-1',
      actorId: 'actor-1',
      learnerIds: ['lrn-a']
    }
  };
}

describe('bulk-enrollment-callback', () => {
  it('buildBulkEnrollmentCallbackUrl trims trailing slash on base URL', () => {
    expect(buildBulkEnrollmentCallbackUrl('http://api:3001/')).toBe(
      `http://api:3001${BULK_ENROLLMENT_CALLBACK_PATH}`
    );
    expect(buildBulkEnrollmentCallbackUrl('http://api:3001')).toBe(
      `http://api:3001${BULK_ENROLLMENT_CALLBACK_PATH}`
    );
  });

  it('throws NonRetryableJobError when callback token is missing', async () => {
    await expect(
      invokeBackendBulkEnrollment('http://localhost:3001', undefined, demoEnvelope(), vi.fn())
    ).rejects.toThrow(NonRetryableJobError);
  });

  it('posts correct URL, headers and JSON body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: { ok: true }, meta: {} }), { status: 200 })
    );
    const envelope: BulkEnrollmentJobEnvelope = {
      ...demoEnvelope(),
      correlation_id: 'corr-z'
    };
    await invokeBackendBulkEnrollment(
      'http://127.0.0.1:3001/',
      'secret-token-xx',
      envelope,
      fetchMock as unknown as typeof fetch
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`http://127.0.0.1:3001${BULK_ENROLLMENT_CALLBACK_PATH}`);
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({
      'content-type': 'application/json',
      'x-worker-callback-token': 'secret-token-xx'
    });
    expect(JSON.parse(init.body as string)).toEqual({
      tenantId: 'tenant_demo',
      requestId: 'mid-1',
      correlationId: 'corr-z',
      payload: envelope.payload
    });
  });

  it('maps envelope forbidden response to NonRetryableJobError', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'forbidden' } }), { status: 403 })
    );
    await expect(
      invokeBackendBulkEnrollment('http://x', 'tok', demoEnvelope(), fetchMock as unknown as typeof fetch)
    ).rejects.toThrow(NonRetryableJobError);
  });

  it('maps validation_error on 400 to NonRetryableJobError', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'validation_error' } }), { status: 400 })
    );
    await expect(
      invokeBackendBulkEnrollment('http://x', 'tok', demoEnvelope(), fetchMock as unknown as typeof fetch)
    ).rejects.toThrow(/bulk callback rejected: validation_error/);
  });

  it('maps 500 with internal_error to generic Error (retryable path)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'internal_error' } }), { status: 500 })
    );
    await expect(
      invokeBackendBulkEnrollment('http://x', 'tok', demoEnvelope(), fetchMock as unknown as typeof fetch)
    ).rejects.toThrow(/bulk_enrollment callback failed http=500/);
  });
});
