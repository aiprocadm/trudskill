import { createHmac } from 'node:crypto';

import { ThrottlerGuard } from '@nestjs/throttler';
import { describe, expect, it } from 'vitest';

import { InMemoryVideoAssetsRepository } from './in-memory-video-assets.repository.js';
import { InMemoryVideoProviderSettingsRepository } from './in-memory-video-provider-settings.repository.js';
import { VideoProviderResolver } from './video-provider-resolver.service.js';
import { VideoProviderSettingsService } from './video-provider-settings.service.js';
import { VideoWebhookController } from './video-webhook.controller.js';
import { KinescopeVideoProvider } from '../../../infrastructure/video-provider/kinescope-video.provider.js';
import {
  NoopVideoProvider,
  type VideoProvider,
  type VideoProviderCode,
  type VideoProviderRegistry
} from '../../../infrastructure/video-provider/video.provider.js';

import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';

/** Приём вебхука видеосервиса (ФТ-B1.2, Фаза 2 Task 10). */

const SECRET = 'webhook-secret';
const T = 'tenant_demo';

async function makeHarness() {
  const assets = new InMemoryVideoAssetsRepository();
  await assets.create({
    id: 'vasset_1',
    tenantId: T,
    providerCode: 'kinescope',
    providerAssetId: 'kine_1',
    status: 'processing',
    sizeBytes: 100
  });
  // Ассет соседнего тенанта — вебхук не должен его задеть.
  await assets.create({
    id: 'vasset_other',
    tenantId: 'tenant_other',
    providerCode: 'kinescope',
    providerAssetId: 'kine_other',
    status: 'processing',
    sizeBytes: 100
  });

  const registry: VideoProviderRegistry = new Map<VideoProviderCode, VideoProvider>([
    ['noop', new NoopVideoProvider()],
    [
      'kinescope',
      new KinescopeVideoProvider({
        apiUrl: 'https://api.kinescope.io/v1',
        apiToken: 'tok',
        webhookSecret: SECRET
      })
    ]
  ]);
  const settings = new VideoProviderSettingsService(new InMemoryVideoProviderSettingsRepository());
  const resolver = new VideoProviderResolver(registry, settings, 'test');
  return { controller: new VideoWebhookController(assets, resolver), assets };
}

const request = (body: unknown, sign = true): [RawBodyRequest<Request>, Record<string, string>] => {
  const raw = Buffer.from(JSON.stringify(body), 'utf8');
  // Тип объявлен явно: без него ветка «без подписи» сужала запись до пустого объекта,
  // и заголовки переставали быть Record<string, string>.
  const headers: Record<string, string> = sign
    ? { 'x-kinescope-signature': createHmac('sha256', SECRET).update(raw).digest('hex') }
    : {};
  return [{ rawBody: raw } as RawBodyRequest<Request>, headers];
};

const readyEvent = (id = 'kine_1') => ({
  event: 'media.update.status',
  data: { id, status: 'done', duration: 300 }
});

describe('VideoWebhookController', () => {
  it('подписанное событие переводит ассет в «готово» и проставляет длительность', async () => {
    const { controller, assets } = await makeHarness();

    const result = await controller.handle(...request(readyEvent()));

    expect(result).toEqual({ ok: true, applied: 1 });
    const asset = await assets.findById(T, 'vasset_1');
    expect(asset?.status).toBe('ready');
    expect(asset?.durationSeconds).toBe(300);
  });

  it('тенант берётся из найденного ассета — вебхук его не выбирает', async () => {
    const { controller, assets } = await makeHarness();

    await controller.handle(...request(readyEvent('kine_other')));

    // Затронут только «свой» ассет соседнего тенанта, наш не тронут.
    expect((await assets.findById('tenant_other', 'vasset_other'))?.status).toBe('ready');
    expect((await assets.findById(T, 'vasset_1'))?.status).toBe('processing');
  });

  it('неподписанное событие ничего не меняет, но отвечает 200', async () => {
    const { controller, assets } = await makeHarness();

    const result = await controller.handle(...request(readyEvent(), false));

    expect(result).toEqual({ ok: true, applied: 0 });
    expect((await assets.findById(T, 'vasset_1'))?.status).toBe('processing');
  });

  it('повторная доставка не переписывает уже готовый ассет', async () => {
    const { controller, assets } = await makeHarness();
    await controller.handle(...request(readyEvent()));

    const again = await controller.handle(...request(readyEvent()));

    expect(again.applied).toBe(0);
    expect((await assets.findById(T, 'vasset_1'))?.status).toBe('ready');
  });

  it('событие об ошибке сохраняет причину для методиста', async () => {
    const { controller, assets } = await makeHarness();

    await controller.handle(
      ...request({
        event: 'media.update.status',
        data: { id: 'kine_1', status: 'error', message: 'битый контейнер' }
      })
    );

    const asset = await assets.findById(T, 'vasset_1');
    expect(asset?.status).toBe('failed');
    expect(asset?.errorMessage).toBe('битый контейнер');
  });

  it('событие о неизвестном видео просто игнорируется', async () => {
    const { controller } = await makeHarness();
    const result = await controller.handle(...request(readyEvent('kine_unknown')));
    expect(result).toEqual({ ok: true, applied: 0 });
  });
});

describe('VideoWebhookController rate limit (ФТ-G2)', () => {
  it('handle применяет ThrottlerGuard и объявляет 60/мин, как соседние вебхуки', () => {
    // Журнал 339: из трёх публичных вебхуков (платежи, вебинары, видео) предел был у двух.
    // Глобального ThrottlerGuard нет — без @UseGuards(ThrottlerGuard) любой @Throttle «спит».
    const handle = VideoWebhookController.prototype.handle;
    const guards =
      (Reflect.getMetadata('__guards__', handle) as Array<{ name?: string }> | undefined) ?? [];
    expect(guards.some((g) => g === ThrottlerGuard || g?.name === 'ThrottlerGuard')).toBe(true);
    expect(Reflect.getMetadata('THROTTLER:LIMITdefault', handle)).toBe(60);
    expect(Reflect.getMetadata('THROTTLER:TTLdefault', handle)).toBe(60_000);
  });
});
