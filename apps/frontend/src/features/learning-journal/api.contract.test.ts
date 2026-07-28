import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type {
  fetchLearningJournalCsvUrl as FetchCsv,
  learningJournalApi as JournalApi,
  toMinutes as ToMinutes
} from './api';
import type { UserSession } from '../../entities/session/model';

const session = {
  user: { id: 'u1', tenantId: 'tenant_demo' },
  tokens: { accessToken: 'token-1' }
} as UserSession;

/** Журнал учебных часов (ФТ-B3.4, Фаза 2 Task 8). */
describe('learning journal api contract', () => {
  const fetchMock = vi.fn();
  let learningJournalApi: typeof JournalApi;
  let fetchLearningJournalCsvUrl: typeof FetchCsv;
  let toMinutes: typeof ToMinutes;

  const envelope = (data: unknown) =>
    new Response(
      JSON.stringify({
        data,
        meta: { requestId: 'r1', correlationId: 'c1', timestamp: '2026-07-28T00:00:00.000Z' }
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    );

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    const mod = await import('./api');
    learningJournalApi = mod.learningJournalApi;
    fetchLearningJournalCsvUrl = mod.fetchLearningJournalCsvUrl;
    toMinutes = mod.toMinutes;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('загружает журнал группы с признаком недобора часов', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValueOnce(
      envelope({
        groupId: 'grp_1',
        groupName: 'ОТ-2026-01',
        plannedAcademicHours: 40,
        belowPlanCount: 1,
        entries: [
          {
            enrollmentId: 'enr_2',
            learnerId: 'lrn_2',
            learnerName: 'Абрамов Антон',
            enrollmentStatus: 'active',
            factHours: 10,
            plannedHours: 40,
            completionPercent: 25,
            belowPlan: true,
            materialSeconds: 27000,
            videoSeconds: 0,
            testSeconds: 0
          }
        ]
      })
    );

    const journal = await learningJournalApi.get(session, 'grp_1');

    expect(journal.belowPlanCount).toBe(1);
    expect(journal.entries[0]?.belowPlan).toBe(true);
    const [url] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toContain('/groups/grp_1/learning-journal');
  });

  it('CSV берётся отдельным запросом мимо конверта API', async () => {
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('URL', { ...URL, createObjectURL: vi.fn(() => 'blob:journal') });
    fetchMock.mockResolvedValueOnce(new Response('csv', { status: 200 }));

    const url = await fetchLearningJournalCsvUrl(session, 'grp_1');

    expect(url).toBe('blob:journal');
    const [requestUrl] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(requestUrl).toContain('/groups/grp_1/learning-journal.csv');
  });

  it('ошибка выгрузки доходит текстом, а не пустым файлом', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 403 }));

    await expect(fetchLearningJournalCsvUrl(session, 'grp_1')).rejects.toThrow(/403/);
  });

  it('toMinutes показывает минуты, а не секунды', () => {
    expect(toMinutes(2700)).toBe(45);
    expect(toMinutes(0)).toBe(0);
  });
});
