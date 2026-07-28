import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type {
  refreshDelayMs as RefreshDelayMs,
  videoPlaybackApi as VideoPlaybackApi
} from './video-playback-api';
import type { UserSession } from '../../entities/session/model';

const session = {
  user: { id: 'u1', tenantId: 'tenant_demo' },
  tokens: { accessToken: 'token-1' }
} as UserSession;

/** Ссылка на просмотр (ФТ-B2.1, Фаза 2 Task 4). */
describe('video playback api', () => {
  const fetchMock = vi.fn();
  let videoPlaybackApi: typeof VideoPlaybackApi;
  let refreshDelayMs: typeof RefreshDelayMs;

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
    const mod = await import('./video-playback-api');
    videoPlaybackApi = mod.videoPlaybackApi;
    refreshDelayMs = mod.refreshDelayMs;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('запрашивает ссылку по материалу и зачислению', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValueOnce(
      envelope({ url: 'https://s3/v.mp4', kind: 'progressive', expiresInSeconds: 600 })
    );

    const source = await videoPlaybackApi.get(session, 'mat_1', 'enr_1');

    expect(source.expiresInSeconds).toBe(600);
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toContain('/video-materials/mat_1/playback');
    // POST, а не GET: короткоживущую ссылку нельзя кэшировать.
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toEqual({ enrollmentId: 'enr_1' });
  });

  it('отказ доступа доходит до плеера текстом, а не молча', async () => {
    vi.stubGlobal('fetch', fetchMock);
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { code: 'domain_rule_violation', message: 'Зачисление не связано с курсом' },
          meta: {}
        }),
        { status: 412, headers: { 'content-type': 'application/json' } }
      )
    );

    await expect(videoPlaybackApi.get(session, 'mat_1', 'enr_1')).rejects.toThrow(/Зачисление/);
  });

  describe('refreshDelayMs', () => {
    it('обновляет ссылку ДО истечения срока, а не после', () => {
      expect(refreshDelayMs(600)).toBeLessThan(600_000);
      expect(refreshDelayMs(600)).toBe(480_000);
    });

    it('не долбит сервер при очень коротком сроке жизни', () => {
      // Даже если сервер выдаст ссылку на 5 секунд, обновляемся не чаще раза в 30 секунд.
      expect(refreshDelayMs(5)).toBe(30_000);
    });
  });
});
