import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  RECERT_PRESETS,
  URGENCY_LABELS,
  formatDaysLeft,
  parseRecertMonths,
  pluralDays
} from './expiring';

import type { recertificationApi as RecertApi } from './expiring';
import type { UserSession } from '../../entities/session/model';

describe('expiring documents helpers (ФТ-E4)', () => {
  it('русские окончания дней, включая 11–14', () => {
    expect(pluralDays(1)).toBe('1 день');
    expect(pluralDays(2)).toBe('2 дня');
    expect(pluralDays(5)).toBe('5 дней');
    expect(pluralDays(11)).toBe('11 дней');
    expect(pluralDays(14)).toBe('14 дней');
    expect(pluralDays(21)).toBe('21 день');
    expect(pluralDays(102)).toBe('102 дня');
  });

  it('срок формулируется по-человечески, просрочка — отдельно', () => {
    expect(formatDaysLeft(12)).toBe('через 12 дней');
    expect(formatDaysLeft(1)).toBe('через 1 день');
    expect(formatDaysLeft(0)).toBe('истекает сегодня');
    expect(formatDaysLeft(-3)).toBe('просрочено на 3 дня');
  });

  it('у каждой группы срочности есть подпись', () => {
    expect(Object.keys(URGENCY_LABELS).sort()).toEqual(['critical', 'expired', 'later', 'soon']);
    for (const label of Object.values(URGENCY_LABELS)) expect(label.length).toBeGreaterThan(0);
  });

  it('пресеты периодичности: 3 года, 1 год и бессрочно', () => {
    expect(RECERT_PRESETS.map((p) => p.months)).toEqual([36, 12, null]);
    for (const preset of RECERT_PRESETS) expect(preset.label.length).toBeGreaterThan(0);
  });

  it('пустая периодичность = бессрочно, а не ошибка', () => {
    expect(parseRecertMonths('')).toEqual({ valid: true, months: null });
    expect(parseRecertMonths('   ')).toEqual({ valid: true, months: null });
  });

  it('мусор и невозможные сроки отвергаются', () => {
    expect(parseRecertMonths('три года')).toEqual({ valid: false });
    expect(parseRecertMonths('0')).toEqual({ valid: false });
    expect(parseRecertMonths('-12')).toEqual({ valid: false });
    expect(parseRecertMonths('999')).toEqual({ valid: false });
    expect(parseRecertMonths('12.5')).toEqual({ valid: false });
  });

  it('нормальные значения проходят', () => {
    expect(parseRecertMonths('36')).toEqual({ valid: true, months: 36 });
    expect(parseRecertMonths(' 12 ')).toEqual({ valid: true, months: 12 });
    expect(parseRecertMonths('120')).toEqual({ valid: true, months: 120 });
  });
});

describe('recertification api contract (ФТ-E4)', () => {
  const fetchMock = vi.fn();
  let recertificationApi: typeof RecertApi;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    recertificationApi = (await import('./expiring')).recertificationApi;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('listExpiring разворачивает конверт и ходит с заголовком тенанта', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            items: [
              {
                id: 'gdoc_1',
                documentNumber: 'УД-1',
                documentType: 'certificate',
                learnerName: 'Иванов И. И.',
                enrollmentId: 'enr_1',
                validUntil: '2026-08-20',
                daysLeft: 16,
                urgency: 'soon'
              }
            ],
            summary: { total: 1, expired: 0, critical: 0, soon: 1, later: 0 },
            horizonDays: 60
          },
          meta: { requestId: 'r1', correlationId: 'c1', timestamp: '2026-08-04T00:00:00.000Z' }
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );

    const session = {
      user: { id: 'u1', tenantId: 'tenant_demo' },
      tokens: { accessToken: 't' }
    } as UserSession;
    const result = await recertificationApi.listExpiring(session);

    expect(result.horizonDays).toBe(60);
    expect(result.items[0]?.urgency).toBe('soon');
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toContain('/recertification/expiring');
    expect(new Headers(init.headers).get('x-tenant-id')).toBe('tenant_demo');
  });
});
