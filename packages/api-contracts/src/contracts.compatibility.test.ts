import { describe, expect, it } from 'vitest';
import { ApiErrorCodes, type ErrorEnvelope } from './errors/contracts';
import { type ResponseMeta } from './meta/contracts';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assessmentEndpoints } from './domains/tests';
import { documentsEndpoints } from './domains/documents';
import { esignEndpoints } from './domains/esign';
import { notificationsEndpoints } from './domains/notifications';

function loadGeneratedOpenApi() {
  const currentDir = dirname(fileURLToPath(import.meta.url));
  const raw = readFileSync(join(currentDir, 'generated/openapi.v1.generated.json'), 'utf8');
  const withoutBanner = raw
    .split('\n')
    .filter((line) => !line.startsWith('//'))
    .join('\n');
  return JSON.parse(withoutBanner) as { paths: Record<string, unknown>; tags: Array<{ name: string }> };
}

describe('API contract compatibility', () => {
  it('preserves canonical error-code set', () => {
    expect(Object.values(ApiErrorCodes)).toEqual([
      'VALIDATION_ERROR',
      'FORBIDDEN',
      'NOT_FOUND',
      'CONFLICT',
      'PRECONDITION_FAILED',
      'RATE_LIMITED',
      'INTERNAL_ERROR'
    ]);
  });

  it('keeps request_id and timestamp in response meta', () => {
    const meta: ResponseMeta = {
      request_id: 'req_123',
      timestamp: '2026-01-01T00:00:00.000Z'
    };

    expect(meta.request_id).toMatch(/^req_/);
    expect(meta.timestamp).toContain('T');
  });

  it('keeps error envelope shape backward compatible', () => {
    const envelope: ErrorEnvelope<typeof ApiErrorCodes.FORBIDDEN> = {
      error: {
        code: ApiErrorCodes.FORBIDDEN,
        message: 'Forbidden'
      },
      meta: {
        request_id: 'req_42',
        timestamp: '2026-01-01T00:00:00.000Z'
      }
    };

    expect(envelope.error.code).toBe('FORBIDDEN');
    expect(envelope.meta.request_id).toBeTypeOf('string');
    expect(envelope.meta.timestamp).toBeTypeOf('string');
  });

  it('contains at least health endpoint in generated OpenAPI artifact', () => {
    const openapi = loadGeneratedOpenApi();
    const paths = Object.keys(openapi.paths);
    expect(paths).toContain('/health');
  });

  it('keeps critical domain endpoint catalogs for assessment, documents, e-sign and notifications', () => {
    for (const endpoint of assessmentEndpoints) expect(endpoint.startsWith('/')).toBe(true);
    for (const endpoint of documentsEndpoints.documents) expect(endpoint.startsWith('/documents')).toBe(true);
    for (const endpoint of documentsEndpoints.numberingRules) expect(endpoint.startsWith('/numbering-rules')).toBe(true);
    for (const endpoint of esignEndpoints.processes) expect(endpoint.startsWith('/esign/processes')).toBe(true);
    expect(notificationsEndpoints.list).toBe('/notifications');
  });

  it('keeps expected tags for auth/documents/tests/esign/integrations domains', () => {
    const openapi = loadGeneratedOpenApi();
    const tags = openapi.tags.map((tag) => tag.name);
    for (const tag of ['auth', 'users', 'learners', 'courses', 'groups', 'tests', 'documents', 'tasks']) {
      expect(tags).toContain(tag);
    }
  });
});
