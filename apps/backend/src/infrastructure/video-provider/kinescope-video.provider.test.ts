import { createHmac } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { KinescopeVideoProvider } from './kinescope-video.provider.js';

/**
 * Адаптер готового видеосервиса (ФТ-B1.2, Фаза 2 Task 10).
 * Решение владельца по вопросу №1 (2026-07-28): «берём готовый видеосервис».
 */

const SECRET = 'webhook-secret';
const API = 'https://api.kinescope.io/v1';

function makeProvider(
  options: {
    token?: string | undefined;
    webhookSecret?: string | undefined;
    response?: unknown;
    ok?: boolean;
    throws?: boolean;
  } = {}
) {
  const fetchFn = vi.fn(async () => {
    if (options.throws) throw new Error('сеть недоступна');
    return new Response(JSON.stringify(options.response ?? {}), {
      status: options.ok === false ? 500 : 200,
      headers: { 'content-type': 'application/json' }
    });
  });
  const provider = new KinescopeVideoProvider({
    apiUrl: API,
    apiToken: 'token' in options ? options.token : 'tok_1',
    webhookSecret: 'webhookSecret' in options ? options.webhookSecret : SECRET,
    fetchFn: fetchFn as unknown as typeof fetch
  });
  return { provider, fetchFn };
}

const signed = (body: unknown) => {
  const raw = Buffer.from(JSON.stringify(body), 'utf8');
  const signature = createHmac('sha256', SECRET).update(raw).digest('hex');
  return { raw, headers: { 'x-kinescope-signature': signature } };
};

describe('KinescopeVideoProvider — авторизация и спящий режим', () => {
  it('без токена адаптер спит: сеть не трогаем вовсе', async () => {
    const { provider, fetchFn } = makeProvider({ token: undefined });

    await expect(
      provider.getPlayback({ tenantId: 't', providerAssetId: 'v1' })
    ).resolves.toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('запрос уходит с Bearer-токеном', async () => {
    const { provider, fetchFn } = makeProvider({ response: { hls_link: 'https://cdn/x.m3u8' } });

    await provider.getPlayback({ tenantId: 't', providerAssetId: 'v1' });

    const [url, init] = fetchFn.mock.calls[0]! as unknown as [string, RequestInit];
    expect(url).toBe(`${API}/videos/v1`);
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer tok_1');
  });

  it('запрос уходит со сроком: молчащий хостинг не держит страницу слушателя (журнал 335)', async () => {
    const { provider, fetchFn } = makeProvider({ response: { hls_link: 'https://cdn/x.m3u8' } });

    await provider.getPlayback({ tenantId: 't', providerAssetId: 'v1' });

    const [, init] = fetchFn.mock.calls[0]! as unknown as [string, RequestInit];
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.signal?.aborted).toBe(false);
  });

  it('недоступная сеть не роняет выдачу — провайдер считается спящим', async () => {
    const { provider } = makeProvider({ throws: true });
    await expect(
      provider.getPlayback({ tenantId: 't', providerAssetId: 'v1' })
    ).resolves.toBeNull();
  });

  it('ошибка API даёт null, а не битую ссылку в плеере', async () => {
    const { provider } = makeProvider({ ok: false });
    await expect(
      provider.getPlayback({ tenantId: 't', providerAssetId: 'v1' })
    ).resolves.toBeNull();
  });
});

describe('KinescopeVideoProvider — воспроизведение', () => {
  it('отдаёт HLS-источник по ссылке из ответа', async () => {
    const { provider } = makeProvider({ response: { hls_link: 'https://cdn/x.m3u8' } });

    const source = await provider.getPlayback({ tenantId: 't', providerAssetId: 'v1' });

    expect(source).toMatchObject({ url: 'https://cdn/x.m3u8', kind: 'hls' });
    expect(source!.expiresInSeconds).toBeGreaterThan(0);
  });

  it('понимает ответ, обёрнутый в data', async () => {
    const { provider } = makeProvider({ response: { data: { play_link: 'https://cdn/y.m3u8' } } });
    const source = await provider.getPlayback({ tenantId: 't', providerAssetId: 'v1' });
    expect(source?.url).toBe('https://cdn/y.m3u8');
  });

  it('ответ без ссылки — null: пустой плеер лучше, чем ссылка в никуда', async () => {
    const { provider } = makeProvider({ response: { status: 'processing' } });
    await expect(
      provider.getPlayback({ tenantId: 't', providerAssetId: 'v1' })
    ).resolves.toBeNull();
  });

  it('без идентификатора у провайдера воспроизводить нечего', async () => {
    const { provider, fetchFn } = makeProvider();
    await expect(provider.getPlayback({ tenantId: 't' })).resolves.toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('KinescopeVideoProvider — цель загрузки', () => {
  it('создаёт видео и отдаёт ссылку для заливки', async () => {
    const { provider, fetchFn } = makeProvider({
      response: { id: 'kine_1', upload_link: 'https://upload/put' }
    });

    const target = await provider.createUploadTarget({
      tenantId: 't',
      assetId: 'vasset_1',
      fileName: 'lesson.mp4',
      sizeBytes: 1024,
      contentType: 'video/mp4'
    });

    expect(target).toEqual({ uploadUrl: 'https://upload/put', providerAssetId: 'kine_1' });
    const [, init] = fetchFn.mock.calls[0]! as unknown as [string, RequestInit];
    // Свой id уходит провайдеру: по нему вебхук находит нашу запись, даже если ответ потерялся.
    expect(JSON.parse(init.body as string)).toMatchObject({ external_id: 'vasset_1' });
  });

  it('ответ без ссылки загрузки — null, ассет не создаётся вслепую', async () => {
    const { provider } = makeProvider({ response: { id: 'kine_1' } });
    await expect(
      provider.createUploadTarget({
        tenantId: 't',
        assetId: 'a',
        fileName: 'f.mp4',
        sizeBytes: 1,
        contentType: 'video/mp4'
      })
    ).resolves.toBeNull();
  });
});

describe('KinescopeVideoProvider — вебхук', () => {
  it('подписанное событие готовности разбирается с длительностью', async () => {
    const { provider } = makeProvider();
    const { raw, headers } = signed({
      event: 'media.update.status',
      data: { id: 'kine_1', status: 'done', duration: 620 }
    });

    await expect(provider.parseWebhook(raw, headers)).resolves.toEqual([
      { providerAssetId: 'kine_1', type: 'ready', durationSeconds: 620 }
    ]);
  });

  it('событие ошибки несёт человекочитаемую причину', async () => {
    const { provider } = makeProvider();
    const { raw, headers } = signed({
      event: 'media.update.status',
      data: { id: 'kine_1', status: 'error', message: 'битый контейнер' }
    });

    const events = await provider.parseWebhook(raw, headers);
    expect(events).toEqual([
      { providerAssetId: 'kine_1', type: 'failed', errorMessage: 'битый контейнер' }
    ]);
  });

  it('БЕЗ ПОДПИСИ событие не принимается — иначе видео объявит готовым кто угодно', async () => {
    const { provider } = makeProvider();
    const raw = Buffer.from(
      JSON.stringify({ event: 'media.update.status', data: { id: 'kine_1', status: 'done' } })
    );

    await expect(provider.parseWebhook(raw, {})).resolves.toBeNull();
  });

  it('подделанная подпись отвергается', async () => {
    const { provider } = makeProvider();
    const { raw } = signed({ event: 'media.update.status', data: { id: 'k', status: 'done' } });

    await expect(
      provider.parseWebhook(raw, { 'x-kinescope-signature': 'a'.repeat(64) })
    ).resolves.toBeNull();
  });

  it('подмена тела при верной подписи старого тела отвергается', async () => {
    const { provider } = makeProvider();
    const { headers } = signed({ event: 'media.update.status', data: { id: 'k', status: 'done' } });
    const tampered = Buffer.from(
      JSON.stringify({ event: 'media.update.status', data: { id: 'ЧУЖОЙ', status: 'done' } })
    );

    await expect(provider.parseWebhook(tampered, headers)).resolves.toBeNull();
  });

  it('без настроенного секрета вебхуки не принимаются вовсе', async () => {
    const { provider } = makeProvider({ webhookSecret: undefined });
    const { raw, headers } = signed({
      event: 'media.update.status',
      data: { id: 'k', status: 'done' }
    });

    await expect(provider.parseWebhook(raw, headers)).resolves.toBeNull();
  });

  it('промежуточный статус — пустой список, а не отказ', async () => {
    const { provider } = makeProvider();
    const { raw, headers } = signed({
      event: 'media.update.status',
      data: { id: 'kine_1', status: 'processing' }
    });

    await expect(provider.parseWebhook(raw, headers)).resolves.toEqual([]);
  });

  it('чужое событие и мусор отвергаются', async () => {
    const { provider } = makeProvider();
    const other = signed({ event: 'billing.updated', data: { id: 'k' } });
    await expect(provider.parseWebhook(other.raw, other.headers)).resolves.toBeNull();

    const garbageRaw = Buffer.from('не json');
    const signature = createHmac('sha256', SECRET).update(garbageRaw).digest('hex');
    await expect(
      provider.parseWebhook(garbageRaw, { 'x-kinescope-signature': signature })
    ).resolves.toBeNull();
  });
});
