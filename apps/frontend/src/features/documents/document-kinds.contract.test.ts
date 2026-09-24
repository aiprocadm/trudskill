import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type * as KindsModule from './document-kinds';
import type { UserSession } from '../../entities/session/model';

const fetchMock = vi.fn();

const session: UserSession = {
  user: {
    id: 'u1',
    tenantId: 'tenant_demo',
    login: 'methodist',
    email: 'm@example.com',
    displayName: 'Методист',
    status: 'active'
  },
  tokens: { accessToken: 'token', sessionId: 's1', expiresIn: 300 },
  roles: ['methodist'],
  permissions: ['documents.read']
};

const kind = (code: string, name: string, templateType: string): KindsModule.DocumentKind => ({
  code,
  name,
  templateType,
  scope: 'group',
  requiresCommission: false,
  requiresProtocol: false,
  numbering: 'none'
});

const catalog = [
  kind('order.enrollment', 'Приказ о зачислении', 'order'),
  kind('order.completion', 'Приказ об окончании обучения', 'order'),
  kind('certificate.ot', 'Удостоверение', 'certificate')
];

describe('виды документов на экранах (МГ-F1.1, срез 18.2)', () => {
  let mod: typeof KindsModule;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    mod = await import('./document-kinds');
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('GET /document-kinds разворачивает конверт { items }', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: { items: catalog },
          meta: { requestId: 'r', correlationId: 'c', timestamp: '2026-09-24T10:00:00.000Z' }
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );
    const result = await mod.documentKindsApi.list(session);
    expect(result.items.map((k) => k.code)).toEqual([
      'order.enrollment',
      'order.completion',
      'certificate.ot'
    ]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/document-kinds$/);
    expect(new Headers(init.headers).get('x-tenant-id')).toBe('tenant_demo');
  });

  it('к бланку подходят только виды его типа', () => {
    expect(mod.kindsForTemplateType(catalog, 'order').map((k) => k.code)).toEqual([
      'order.enrollment',
      'order.completion'
    ]);
    expect(mod.kindsForTemplateType(catalog, 'contract')).toEqual([]);
    expect(mod.kindsForTemplateType(catalog, undefined)).toEqual([]);
  });

  it('вид подставляется сам, только когда он единственный для типа', () => {
    expect(mod.defaultKindFor(catalog, 'certificate')).toBe('certificate.ot');
    expect(mod.defaultKindFor(catalog, 'order')).toBeUndefined();
    expect(mod.defaultKindFor(catalog, 'contract')).toBeUndefined();
  });

  it('подпись вида — название, а не код', () => {
    expect(mod.documentKindLabel(catalog, 'order.completion')).toBe('Приказ об окончании обучения');
    expect(mod.documentKindLabel(catalog, undefined)).toBe('Любой вид этого типа');
    expect(mod.documentKindLabel(catalog, 'x.unknown')).toBe('Вид не найден в справочнике');
  });
});
