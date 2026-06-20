import { Inject, Injectable } from '@nestjs/common';

import { WebinarProviderSettingsService } from './webinar-provider-settings.service.js';
import { backendEnv } from '../../env.js';
import {
  NoopWebinarProvider,
  WEBINAR_PROVIDER_REGISTRY,
  type WebinarProvider,
  type WebinarProviderRegistry
} from '../../infrastructure/webinar-provider/webinar.provider.js';

/**
 * Resolves the active WebinarProvider FOR A TENANT. Unlike the single-token PaymentProvider, the
 * webinar provider is per-tenant (different учебные центры → different providers). This is also
 * where the prod-guard lives: a tenant whose saved provider is `fake` is forced to Noop in
 * production (env refinement can't catch it — env doesn't name the per-tenant provider).
 */
@Injectable()
export class WebinarProviderResolver {
  private readonly noop = new NoopWebinarProvider();

  constructor(
    @Inject(WEBINAR_PROVIDER_REGISTRY) private readonly registry: WebinarProviderRegistry,
    @Inject(WebinarProviderSettingsService)
    private readonly settings: WebinarProviderSettingsService,
    // Overridable in tests; defaults to real env at DI time (see provider factory in the module).
    private readonly enabledGlobally: boolean = backendEnv.WEBINARS_ENABLED,
    private readonly nodeEnv: string = backendEnv.NODE_ENV
  ) {}

  async forTenant(tenantId: string): Promise<WebinarProvider> {
    if (!this.enabledGlobally) return this.noop;
    const cfg = await this.settings.get(tenantId);
    if (!cfg.enabled || cfg.providerCode === 'noop') return this.noop;
    if (cfg.providerCode === 'fake' && this.nodeEnv === 'production') {
      console.warn(
        `[webinars] tenant ${tenantId} has provider=fake in production — forcing Noop (fake is staging-only)`
      );
      return this.noop;
    }
    return this.registry.get(cfg.providerCode) ?? this.noop;
  }
}
