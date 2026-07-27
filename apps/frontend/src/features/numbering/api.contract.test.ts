import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { numberingApi as NumberingApi, previewNumber as PreviewNumber } from './api';
import type { UserSession } from '../../entities/session/model';

const session = {
  user: { id: 'u1', tenantId: 'tenant_demo' },
  tokens: { accessToken: 'token-1' }
} as UserSession;

describe('numbering api contract (ФТ-A4.1)', () => {
  const fetchMock = vi.fn();
  let numberingApi: typeof NumberingApi;
  let previewNumber: typeof PreviewNumber;

  const envelope = (data: unknown) =>
    new Response(
      JSON.stringify({
        data,
        meta: { requestId: 'r1', correlationId: 'c1', timestamp: '2026-07-27T00:00:00.000Z' }
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );

  const rule = {
    id: 'nrule_1',
    documentType: 'certificate',
    prefix: 'CERT-',
    suffix: '',
    pattern: '{prefix}{counter}{suffix}',
    currentCounter: 12,
    resetPeriod: 'none' as const,
    isActive: true,
    updatedAt: '2026-07-27T00:00:00.000Z'
  };

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    const mod = await import('./api');
    numberingApi = mod.numberingApi;
    previewNumber = mod.previewNumber;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('list разворачивает конверт и отдаёт правила', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValueOnce(envelope({ items: [rule], total: 1 }));

    const result = await numberingApi.list(session);

    expect(result.items[0]?.documentType).toBe('certificate');
    const [url] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toContain('/numbering-rules');
  });

  it('create отправляет стартовое значение как есть', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValueOnce(envelope(rule));

    await numberingApi.create(session, {
      documentType: 'certificate',
      prefix: 'CERT-',
      startCounter: 137
    });

    const [, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({
      documentType: 'certificate',
      prefix: 'CERT-',
      startCounter: 137
    });
  });

  it('update шлёт PATCH на конкретное правило', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValueOnce(envelope(rule));

    await numberingApi.update(session, 'nrule_1', { resetPeriod: 'year' });

    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toContain('/numbering-rules/nrule_1');
    expect(init.method).toBe('PATCH');
  });

  it('deactivate бьёт в свой эндпоинт, а не в activate', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValueOnce(envelope({ ...rule, isActive: false }));

    await numberingApi.deactivate(session, 'nrule_1');

    const [url] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toContain('/numbering-rules/nrule_1/deactivate');
  });

  describe('previewNumber — предпросмотр повторяет серверную сборку', () => {
    it('подставляет префикс и шестизначный счётчик', () => {
      expect(
        previewNumber(
          {
            prefix: 'CERT-',
            suffix: '',
            pattern: '{prefix}{counter}{suffix}',
            resetPeriod: 'none'
          },
          137
        )
      ).toBe('CERT-000137');
    });

    it('дописывает период в маску, если период включён, а маска его не содержит', () => {
      expect(
        previewNumber(
          {
            prefix: 'CERT-',
            suffix: '',
            pattern: '{prefix}{counter}{suffix}',
            resetPeriod: 'year'
          },
          1,
          new Date('2026-03-05T00:00:00.000Z')
        )
      ).toBe('CERT-2026-000001');
    });

    it('в помесячном режиме период двузначный', () => {
      expect(
        previewNumber(
          {
            prefix: 'ПР-',
            suffix: '',
            pattern: '{prefix}{period}/{counter}',
            resetPeriod: 'month'
          },
          7,
          new Date('2026-03-05T00:00:00.000Z')
        )
      ).toBe('ПР-2026-03/000007');
    });

    it('уважает суффикс и произвольный порядок токенов', () => {
      expect(
        previewNumber(
          { prefix: '', suffix: '-ОТ', pattern: '{counter}{suffix}', resetPeriod: 'none' },
          42
        )
      ).toBe('000042-ОТ');
    });
  });
});
