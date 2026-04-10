import { Body, Controller, Headers, Inject, Param, Post, UseGuards } from '@nestjs/common';

import { CurrentContext } from '../../../common/decorators/current-context.decorator.js';
import { TenantGuard } from '../../../common/guards/tenant.guard.js';
import { backendEnv } from '../../../env.js';
import { AdapterResolver } from '../services/adapter-resolver.service.js';
import { IdempotencyService } from '../services/idempotency.service.js';
import { IntegrationCryptoService } from '../services/integration-crypto.service.js';
import { IntegrationOrchestratorService } from '../services/integration-orchestrator.service.js';
import { WebhookSignatureVerifier } from '../services/webhook-signature-verifier.service.js';

import type { RequestContext } from '../../../common/context/request-context.js';
import type { WebhookDto } from '../dto/integrations.dto.js';

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

  @Post(':providerCode')
  handle(
    @CurrentContext() ctx: RequestContext,
    @Param('providerCode') providerCode: string,
    @Body() body: WebhookDto,
    @Headers('x-signature') signature?: string
  ) {
    return this.process(ctx, providerCode, body.eventType ?? 'default', body, signature);
  }

  @Post('reprocess-failed')
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
    this.orchestrator.publishIntegrationEvent(ctx.tenantId!, 'integration.webhook.received', {
      provider_code: providerCode,
      event_type: eventType,
      event_id: body.eventId ?? null
    });
    this.verifier.verify(signature, backendEnv.INTEGRATION_WEBHOOK_SECRET);
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
