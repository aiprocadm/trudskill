import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type {
  PROGRESS_HEARTBEAT_MS as HeartbeatMs,
  timeRangesToArray as TimeRangesToArray,
  videoProgressApi as VideoProgressApi
} from './video-progress-api';
import type { UserSession } from '../../entities/session/model';

const session = {
  user: { id: 'u1', tenantId: 'tenant_demo' },
  tokens: { accessToken: 'token-1' }
} as UserSession;

/** Отправка прогресса просмотра (ФТ-B3.1, Фаза 2 Task 6). */
describe('video progress api', () => {
  const fetchMock = vi.fn();
  let videoProgressApi: typeof VideoProgressApi;
  let timeRangesToArray: typeof TimeRangesToArray;
  let PROGRESS_HEARTBEAT_MS: typeof HeartbeatMs;

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
    const mod = await import('./video-progress-api');
    videoProgressApi = mod.videoProgressApi;
    timeRangesToArray = mod.timeRangesToArray;
    PROGRESS_HEARTBEAT_MS = mod.PROGRESS_HEARTBEAT_MS;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('шлёт позицию и проигранные отрезки', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValueOnce(
      envelope({
        coveragePercent: 42,
        completed: false,
        lastPositionSeconds: 250,
        maxPositionSeconds: 250,
        requiredPercent: 90,
        seekForwardBlocked: true
      })
    );

    const result = await videoProgressApi.send(session, 'mat_1', {
      enrollmentId: 'enr_1',
      positionSeconds: 250,
      ranges: [[0, 250]]
    });

    // «Пройдено» приходит С СЕРВЕРА — клиент это не решает.
    expect(result.completed).toBe(false);
    expect(result.requiredPercent).toBe(90);
    // ФТ-B3.2: запрет перемотки приходит С СЕРВЕРА, клиент его не выдумывает.
    expect(result.seekForwardBlocked).toBe(true);
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toContain('/video-materials/mat_1/progress');
    expect(JSON.parse(init.body as string)).toEqual({
      enrollmentId: 'enr_1',
      positionSeconds: 250,
      ranges: [[0, 250]]
    });
  });

  it('допуск перемотки на клиенте совпадает с серверным — плеер не откатывает зачтённое', async () => {
    const mod = await import('./video-progress-api');
    expect(mod.SEEK_TOLERANCE_SECONDS).toBe(60);
  });

  it('частота heartbeat — в пределах 10–15 секунд из ТЗ', () => {
    expect(PROGRESS_HEARTBEAT_MS).toBeGreaterThanOrEqual(10_000);
    expect(PROGRESS_HEARTBEAT_MS).toBeLessThanOrEqual(15_000);
  });

  describe('timeRangesToArray', () => {
    const fakeRanges = (pairs: Array<[number, number]>): TimeRanges =>
      ({
        length: pairs.length,
        start: (i: number) => pairs[i]![0],
        end: (i: number) => pairs[i]![1]
      }) as unknown as TimeRanges;

    it('переводит проигранные браузером куски в массив пар', () => {
      expect(
        timeRangesToArray(
          fakeRanges([
            [0, 60],
            [120, 180]
          ])
        )
      ).toEqual([
        [0, 60],
        [120, 180]
      ]);
    });

    it('пустые и отсутствующие диапазоны дают пустой массив, а не падение', () => {
      expect(timeRangesToArray(fakeRanges([]))).toEqual([]);
      expect(timeRangesToArray(null)).toEqual([]);
      expect(timeRangesToArray(undefined)).toEqual([]);
    });
  });
});
