import { Inject, Injectable } from '@nestjs/common';

import { PaymentProviderSettingsService } from './payment-provider-settings.service.js';
import { backendEnv } from '../../env.js';
import {
  NoopPaymentProvider,
  PAYMENT_PROVIDER_REGISTRY,
  type PaymentProvider,
  type PaymentProviderCode,
  type PaymentProviderRegistry
} from '../../infrastructure/payments/payment.provider.js';

/**
 * Resolves the active PaymentProvider FOR A TENANT. The prod-guard for `fake` lives here (env no
 * longer names the active provider — it is per-tenant). Mirrors WebinarProviderResolver.
 * `fromRegistry` exists because per-provider webhook URLs (`/payments/webhook/:providerCode`) are
 * unguarded — there is no tenant in that request, so the webhook handler picks the provider by
 * code directly from the registry instead of going through `forTenant`.
 */
@Injectable()
export class PaymentProviderResolver {
  private readonly noop = new NoopPaymentProvider();

  constructor(
    @Inject(PAYMENT_PROVIDER_REGISTRY) private readonly registry: PaymentProviderRegistry,
    @Inject(PaymentProviderSettingsService)
    private readonly settings: PaymentProviderSettingsService,
    private readonly enabledGlobally: boolean = backendEnv.PAYMENTS_ENABLED,
    private readonly nodeEnv: string = backendEnv.NODE_ENV
  ) {}

  async forTenant(tenantId: string): Promise<PaymentProvider> {
    if (!this.enabledGlobally) return this.noop;
    const cfg = await this.settings.get(tenantId);
    if (!cfg.enabled || cfg.providerCode === 'noop') return this.noop;
    if (cfg.providerCode === 'fake' && this.nodeEnv === 'production') {
      console.warn(
        `[payments] tenant ${tenantId} has provider=fake in production — forcing Noop (fake is staging-only)`
      );
      return this.noop;
    }
    return this.registry.get(cfg.providerCode as PaymentProviderCode) ?? this.noop;
  }

  /** Used by the unguarded webhook (no tenant): the env-credentialed registry singleton. */
  fromRegistry(code: string): PaymentProvider | undefined {
    if (code === 'fake' && this.nodeEnv === 'production') return undefined;
    return this.registry.get(code as PaymentProviderCode);
  }
}
