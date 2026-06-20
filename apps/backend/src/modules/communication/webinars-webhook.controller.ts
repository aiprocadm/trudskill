import { Controller, Headers, Inject, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { WebinarProviderResolver } from './webinar-provider-resolver.service.js';
import { WebinarsService } from './webinars.service.js';

import type { Request } from 'express';

/**
 * Unguarded webinar webhook (mirrors PaymentsWebhookController). The provider POSTs to a public URL
 * with no JWT / x-tenant-id. Tenant is resolved from the stored webinar row
 * (provider_session_id → tenant_id); authenticity is the provider's signature check inside
 * parseWebhook. Noop returns null → 200 no-op. Cross-tenant isolation holds: a webhook can only
 * touch the single webinar whose provider_session_id it carries.
 */
@Controller('webinars')
export class WebinarsWebhookController {
  constructor(
    @Inject(WebinarProviderResolver) private readonly resolver: WebinarProviderResolver,
    @Inject(WebinarsService) private readonly service: WebinarsService
  ) {}

  @Post('webhook')
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  async handle(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers() headers: Record<string, string>
  ) {
    const raw = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    let body: { providerSessionId?: unknown } = {};
    try {
      body = JSON.parse(raw.toString('utf8'));
    } catch {
      return { ok: true };
    }
    if (typeof body.providerSessionId !== 'string') return { ok: true };
    const webinar = await this.service.findByProviderSessionId(body.providerSessionId);
    if (!webinar) return { ok: true };
    const provider = await this.resolver.forTenant(webinar.tenantId);
    const events = await provider.parseWebhook(raw, headers);
    if (!events) return { ok: true };
    for (const e of events) {
      await this.service.recordAttendance(webinar.tenantId, webinar.id, {
        participantRef: e.participantRef,
        attendanceStatus: e.type === 'joined' ? 'joined' : 'left',
        ...(e.type === 'joined' ? { joinedAt: e.occurredAt } : { leftAt: e.occurredAt }),
        ...(e.durationSeconds !== undefined ? { durationSeconds: e.durationSeconds } : {})
      });
    }
    return { ok: true };
  }
}
