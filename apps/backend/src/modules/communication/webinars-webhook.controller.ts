import { Controller, Headers, Inject, Post, Req, Res } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

import { WebinarProviderResolver } from './webinar-provider-resolver.service.js';
import { WebinarsService } from './webinars.service.js';

import type { Request, Response } from 'express';

/**
 * Unguarded webinar webhook (mirrors PaymentsWebhookController). The provider POSTs to a public URL
 * with no JWT / x-tenant-id. Tenant is resolved from the stored webinar row
 * (provider_session_id → tenant_id); authenticity is the provider's signature check inside
 * parseWebhook. Noop returns null → 200 no-op. Cross-tenant isolation holds: a webhook can only
 * touch the single webinar whose provider_session_id it carries.
 *
 * IMPORTANT: the handler uses @Res() and writes directly to the Express response so the global
 * ResponseEnvelopeInterceptor is bypassed. A real provider expects a literal ack body (not the
 * wrapped `{ data, meta }`) or it will reject and retry — the provider supplies it via webhookAck.
 * Pattern mirrors PaymentsWebhookController.
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
    @Headers() headers: Record<string, string>,
    @Res() res: Response
  ): Promise<void> {
    const sendAck = (ack: string | Record<string, unknown>): void => {
      if (typeof ack === 'string') {
        res.status(200).type('text/plain').send(ack);
      } else {
        res.status(200).json(ack);
      }
    };

    const raw = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    let body: { providerSessionId?: unknown } = {};
    try {
      body = JSON.parse(raw.toString('utf8'));
    } catch {
      sendAck({ ok: true });
      return;
    }
    if (typeof body.providerSessionId !== 'string') {
      sendAck({ ok: true });
      return;
    }
    const webinar = await this.service.findByProviderSessionId(body.providerSessionId);
    if (!webinar) {
      sendAck({ ok: true });
      return;
    }
    const provider = await this.resolver.forTenant(webinar.tenantId);
    const events = await provider.parseWebhook(raw, headers);
    const ack = () => provider.webhookAck?.(events) ?? { ok: true };
    if (!events) {
      sendAck(ack());
      return;
    }
    for (const e of events) {
      await this.service.recordAttendance(webinar.tenantId, webinar.id, {
        participantRef: e.participantRef,
        attendanceStatus: e.type === 'joined' ? 'joined' : 'left',
        ...(e.type === 'joined' ? { joinedAt: e.occurredAt } : { leftAt: e.occurredAt }),
        ...(e.durationSeconds !== undefined ? { durationSeconds: e.durationSeconds } : {})
      });
    }
    sendAck(ack());
  }
}
