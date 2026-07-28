import { Inject, Injectable } from '@nestjs/common';

import { VideoProviderSettingsService } from './video-provider-settings.service.js';
import { backendEnv } from '../../../env.js';
import {
  NoopVideoProvider,
  VIDEO_PROVIDER_REGISTRY,
  type VideoProvider,
  type VideoProviderRegistry
} from '../../../infrastructure/video-provider/video.provider.js';

/**
 * Выбирает активный `VideoProvider` ДЛЯ ТЕНАНТА (ФТ-B1.1) — как `WebinarProviderResolver`.
 *
 * Здесь же живёт прод-предохранитель: тенант, у которого в настройках сохранён `fake`,
 * в production принудительно опускается до `noop`. Проверка схемы env этого поймать не может —
 * env не знает, какой провайдер выбран у конкретного тенанта, а выдавать в проде фальшивое
 * видео за настоящее недопустимо.
 */
@Injectable()
export class VideoProviderResolver {
  private readonly noop = new NoopVideoProvider();

  constructor(
    @Inject(VIDEO_PROVIDER_REGISTRY) private readonly registry: VideoProviderRegistry,
    @Inject(VideoProviderSettingsService)
    private readonly settings: VideoProviderSettingsService,
    // Переопределяется в тестах; по умолчанию — реальный env на момент сборки DI.
    private readonly nodeEnv: string = backendEnv.NODE_ENV
  ) {}

  async forTenant(tenantId: string): Promise<VideoProvider> {
    const cfg = await this.settings.get(tenantId);
    if (!cfg.enabled || cfg.providerCode === 'noop') return this.noop;
    if (cfg.providerCode === 'fake' && this.nodeEnv === 'production') {
      console.warn(
        `[video] tenant ${tenantId} has provider=fake in production — forcing Noop (fake is staging-only)`
      );
      return this.noop;
    }
    return this.registry.get(cfg.providerCode) ?? this.noop;
  }
}
