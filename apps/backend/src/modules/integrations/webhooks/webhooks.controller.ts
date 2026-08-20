import { Body, Controller, Headers, Inject, Param, Post, UseGuards } from '@nestjs/common';

import { CurrentContext } from '../../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../../common/guards/tenant.guard.js';
import { backendEnv } from '../../../env.js';
import { RequirePermissions } from '../../iam/permission.decorator.js';
import { PermissionGuard } from '../../iam/permission.guard.js';
import { WebhookDto } from '../dto/integrations.dto.js';
import { AdapterResolver } from '../services/adapter-resolver.service.js';
import { IdempotencyService } from '../services/idempotency.service.js';
import { IntegrationCryptoService } from '../services/integration-crypto.service.js';
import { IntegrationOrchestratorService } from '../services/integration-orchestrator.service.js';
import { WebhookSignatureVerifier } from '../services/webhook-signature-verifier.service.js';

import type { RequestContext } from '../../../common/context/request-context.js';
// ВАЖНО: значение, а не `import type` — см. пояснение в auth.controller.ts.

@Controller('webhooks')
@UseGuards(TenantGuard)
export class WebhooksController {
  constructor(
    @Inject(IntegrationOrchestratorService)
    private readonly orchestrator: IntegrationOrchestratorService,
    @Inject(AdapterResolver) private readonly adapterResolver: AdapterResolver,
    @Inject(WebhookSignatureVerifier) private readonly verifier: WebhookSignatureVerifier,
    @Inject(IdempotencyService) private readonly idempotency: IdempotencyService,
    @Inject(IntegrationCryptoService) private readonly crypto: IntegrationCryptoService
  ) {}

  /*
   * ⚠️ Объявлен ВЫШЕ `@Post(':providerCode')` намеренно, и переставлять нельзя.
   * NestJS сопоставляет маршруты в порядке объявления: пока этот блок стоял ниже,
   * запрос `POST /webhooks/reprocess-failed` попадал в обработчик внешнего вебхука —
   * «reprocess-failed» принималось за код провайдера, и ручка отвечала «неверная подпись».
   * То есть переобработка не работала вообще. Закреплено сторожем `route-shadowing`.
   *
   * Право: это административная операция своего центра, а не внешний вызов.
   */
  @Post('reprocess-failed')
  @UseGuards(PermissionGuard)
  @RequirePermissions('integrations.write')
  reprocessFailed(
    @CurrentContext() ctx: RequestContext,
    @Body('providerCode') providerCode?: string
  ) {
    const failed = this.orchestrator.listFailedWebhookLogs(ctx.tenantId!, providerCode);
    this.orchestrator.publishIntegrationEvent(
      ctx.tenantId!,
      'integration.webhook.reprocess_requested',
      {
        provider_code: providerCode ?? 'all',
        failed_count: failed.length
      }
    );
    return { accepted: true, queued: failed.length };
  }

  @Post(':providerCode')
  handle(
    @CurrentContext() ctx: RequestContext,
    @Param('providerCode') providerCode: string,
    @Body() body: WebhookDto,
    @Headers('x-signature') signature?: string
  ) {
    return this.process(ctx, providerCode, body.eventType ?? 'default', body, signature);
  }

  @Post(':providerCode/:eventType')
  handleByType(
    @CurrentContext() ctx: RequestContext,
    @Param('providerCode') providerCode: string,
    @Param('eventType') eventType: string,
    @Body() body: WebhookDto,
    @Headers('x-signature') signature?: string
  ) {
    return this.process(ctx, providerCode, eventType, body, signature);
  }

  private async process(
    ctx: RequestContext,
    providerCode: string,
    eventType: string,
    body: WebhookDto,
    signature?: string
  ) {
    // §5.160: verify the shared secret BEFORE emitting any realtime event, so an
    // unauthenticated caller cannot spam tenant subscribers with a "received" ping.
    this.verifier.verify(signature, backendEnv.INTEGRATION_WEBHOOK_SECRET);
    this.orchestrator.publishIntegrationEvent(ctx.tenantId!, 'integration.webhook.received', {
      provider_code: providerCode,
      event_type: eventType,
      event_id: body.eventId ?? null
    });
    const dedupeKey = `${ctx.tenantId}:webhook:${providerCode}:${body.eventId ?? this.crypto.hashPayload(body.payload ?? body)}`;
    const duplicate = this.idempotency.get(dedupeKey);
    if (duplicate) {
      this.orchestrator.appendWebhookLog(ctx.tenantId!, {
        providerCode,
        entityType: 'webhook',
        entityId: body.eventId ?? 'hash',
        requestPayloadJsonb: body as Record<string, unknown>,
        responsePayloadJsonb: { duplicate: true },
        statusCode: 200,
        status: 'duplicate'
      });
      this.orchestrator.publishIntegrationEvent(ctx.tenantId!, 'integration.webhook.processed', {
        provider_code: providerCode,
        event_type: eventType,
        duplicate: true
      });
      return { accepted: true, duplicate: true };
    }
    const adapter = this.adapterResolver.resolve(providerCode);
    const payload = body.payload ?? {};
    try {
      const result = await adapter.handleWebhook({ eventType, payload });
      this.idempotency.remember(dedupeKey, result);
      this.orchestrator.appendWebhookLog(ctx.tenantId!, {
        providerCode,
        entityType: 'webhook',
        entityId: body.eventId ?? result.externalId ?? 'unknown',
        requestPayloadJsonb: body as Record<string, unknown>,
        responsePayloadJsonb: result as Record<string, unknown>,
        statusCode: 202,
        status: 'accepted'
      });
      this.orchestrator.publishIntegrationEvent(ctx.tenantId!, 'integration.webhook.processed', {
        provider_code: providerCode,
        event_type: eventType,
        duplicate: false,
        status: result.status
      });
      return { accepted: true, result };
    } catch (error) {
      const normalizedError = adapter.normalizeError(error);
      this.orchestrator.appendWebhookLog(ctx.tenantId!, {
        providerCode,
        entityType: 'webhook',
        entityId: body.eventId ?? 'unknown',
        requestPayloadJsonb: body as Record<string, unknown>,
        responsePayloadJsonb: normalizedError,
        statusCode: 500,
        status: 'error'
      });
      throw error;
    }
  }
}
