import { Controller, Headers, Inject, Post, RawBodyRequest, Req } from '@nestjs/common';

import { VIDEO_ASSETS_REPOSITORY, type VideoAssetsRepository } from './video-assets.repository.js';
import { VideoProviderResolver } from './video-provider-resolver.service.js';

import type { Request } from 'express';

/**
 * Вебхук видеосервиса (ФТ-B1.2, Фаза 2 Task 10).
 *
 * Публичный маршрут: провайдер стучится снаружи и наших токенов не имеет. Защита —
 * подпись тела, которую проверяет сам адаптер (`parseWebhook`); неподписанное или
 * неопознанное событие даёт `null`, и мы отвечаем «принято», ничего не меняя.
 *
 * Почему отвечаем 200 даже на отвергнутый payload: провайдер при ошибке будет ретраить
 * бесконечно, а отличить «подпись не сошлась» от «наша база лежит» он всё равно не может.
 * Всё, что нас касается, — не применить чужое событие.
 *
 * Тенант берётся ИЗ НАЙДЕННОГО ассета: вебхук знает только идентификатор провайдера и
 * выбрать тенанта не может — иначе это была бы дыра в изоляции.
 */
@Controller('internal/webhooks/video')
export class VideoWebhookController {
  constructor(
    @Inject(VIDEO_ASSETS_REPOSITORY) private readonly assets: VideoAssetsRepository,
    @Inject(VideoProviderResolver) private readonly providers: VideoProviderResolver
  ) {}

  @Post()
  async handle(
    @Req() req: RawBodyRequest<Request>,
    @Headers() headers: Record<string, string | undefined>
  ): Promise<{ ok: true; applied: number }> {
    const raw = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}), 'utf8');

    // Тенанта в вебхуке нет, поэтому подпись проверяют все адаптеры по очереди —
    // событие применит тот, который его опознал (см. parseWebhookWithAnyProvider).
    const events = await this.providers.parseWebhookWithAnyProvider(raw, headers);
    if (!events?.length) return { ok: true, applied: 0 };

    let applied = 0;
    for (const event of events) {
      const asset = await this.assets.findByProviderAssetId(event.providerAssetId);
      if (!asset) continue;
      // Терминальные ассеты не переписываем: повторная доставка вебхука — норма.
      if (asset.status === 'ready' || asset.status === 'failed') continue;

      await this.assets.update(asset.tenantId, asset.id, {
        status: event.type === 'ready' ? 'ready' : 'failed',
        ...(event.durationSeconds ? { durationSeconds: event.durationSeconds } : {}),
        ...(event.type === 'failed'
          ? { errorMessage: event.errorMessage ?? 'Видеосервис не смог обработать файл' }
          : { errorMessage: null })
      });
      applied += 1;
    }
    return { ok: true, applied };
  }
}
