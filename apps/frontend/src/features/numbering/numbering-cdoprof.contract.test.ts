import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { NUMBERING_PRESETS, presetOf } from './presets';

import type * as ApiModule from './api';
import type * as DrawerModule from './numbering-rule-drawer';
import type * as ScreensModule from './screens';
import type { UserSession } from '../../entities/session/model';

const fetchMock = vi.fn();

const session: UserSession = {
  user: {
    id: 'u1',
    tenantId: 'tenant_demo',
    login: 'admin',
    email: 'a@example.com',
    displayName: 'Администратор',
    status: 'active'
  },
  tokens: { accessToken: 'token', sessionId: 's1', expiresIn: 300 },
  roles: ['tenant_admin'],
  permissions: ['documents.read', 'documents.write', 'tenant.settings.write']
};

const envelope = (data: unknown) =>
  new Response(
    JSON.stringify({
      data,
      meta: { requestId: 'r', correlationId: 'c', timestamp: '2026-09-24T10:00:00.000Z' }
    }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );

describe('нумерация CDOPROF на экране (МГ-F3.1, срез 19.3)', () => {
  let api: typeof ApiModule;
  let drawer: typeof DrawerModule;
  let screens: typeof ScreensModule;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    api = await import('./api');
    drawer = await import('./numbering-rule-drawer');
    screens = await import('./screens');
  });

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('предпросмотр спрашивает сервер по виду и группе', async () => {
    fetchMock.mockResolvedValueOnce(envelope({ next: '264501-1', missing: [], ruleId: 'r1' }));
    const result = await api.numberingApi.preview(session, {
      kindCode: 'certificate.ot',
      groupId: 'g1'
    });
    expect(result.next).toBe('264501-1');
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/numbering-rules\/preview\?kindCode=certificate\.ot&groupId=g1$/);
  });

  it('сброс отправляет подтверждение и номер, с которого начать', async () => {
    fetchMock.mockResolvedValueOnce(envelope({ id: 'r1', currentCounter: 0 }));
    await api.numberingApi.reset(session, 'r1', { confirmation: '137', startCounter: 1 });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/numbering-rules\/r1\/reset$/);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ confirmation: '137', startCounter: 1 });
  });

  it('маска с токенами CDOPROF показывается на примере группы 264501', () => {
    const base = { prefix: '', suffix: '', resetPeriod: 'none' as const };
    expect(api.previewNumber({ ...base, pattern: '{group.code}' }, 1)).toBe('264501');
    expect(api.previewNumber({ ...base, pattern: '{protocol.number}-{seq.group}' }, 5)).toBe(
      '264501-1'
    );
    expect(
      api.previewNumber(
        {
          ...base,
          pattern: '{parts}',
          parts: [
            { start: 2645, auto: false },
            { start: 1, auto: true }
          ]
        },
        3
      )
    ).toBe('2645-3');
    expect(api.previewNumber({ ...base, pattern: '{series} {counter}', series: 'АБ' }, 7)).toBe(
      'АБ 000007'
    );
    expect(api.usesGroupFacts('{prefix}{counter}')).toBe(false);
    expect(api.usesGroupFacts('{group.code}')).toBe(true);
  });

  it('готовые шаблоны узнаются по маске, своя маска — «своя»', () => {
    expect(presetOf('{group.code}')).toBe('group_code');
    expect(presetOf('{protocol.number}-{seq.group}')).toBe('protocol_seq');
    expect(presetOf('ПР-{counter}')).toBe('custom');
    expect(new Set(NUMBERING_PRESETS.map((p) => p.id)).size).toBe(NUMBERING_PRESETS.length);
  });

  it('в запрос уходят только поля, которые есть в маске', () => {
    const form = {
      documentType: 'certificate',
      kindCode: 'certificate.ot',
      pattern: '{protocol.number}-{seq.group}',
      prefix: 'УД-',
      suffix: '',
      series: 'АБ',
      parts: [{ start: 1, auto: true }],
      resetPeriod: 'none' as const,
      startCounter: '1'
    };
    expect(drawer.toCreateInput(form, 1)).toEqual({
      documentType: 'certificate',
      kindCode: 'certificate.ot',
      pattern: '{protocol.number}-{seq.group}',
      resetPeriod: 'none',
      startCounter: 1
    });
  });

  it('«Следующий номер»: сервер, пример по группе или «выключен»', () => {
    const rule = {
      prefix: '',
      suffix: '',
      pattern: '{group.code}',
      resetPeriod: 'none' as const,
      currentCounter: 0,
      isActive: true
    };
    expect(screens.nextNumberView(rule, { next: '264501' })).toBe('264501');
    expect(screens.nextNumberView(rule, { next: null })).toBe('по данным группы, например 264501');
    expect(screens.nextNumberView({ ...rule, isActive: false }, undefined)).toBe(
      'нумератор выключен'
    );
  });
});
