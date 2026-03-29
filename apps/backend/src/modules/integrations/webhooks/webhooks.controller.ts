import { Body, Controller, Headers, Param, Post, UseGuards } from '@nestjs/common';
import { TenantGuard } from '../../../common/guards/tenant.guard.js';
import { CurrentContext } from '../../../common/decorators/current-context.decorator.js';
import type { RequestContext } from '../../../common/context/request-context.js';
import { WebhookDto } from '../dto/integrations.dto.js';
import { IntegrationOrchestratorService } from '../services/integration-orchestrator.service.js';
import { IdempotencyService } from '../services/idempotency.service.js';
import { IntegrationCryptoService } from '../services/integration-crypto.service.js';
import { ProviderRegistry } from '../services/provider-registry.service.js';
import { WebhookSignatureVerifier } from '../services/webhook-signature-verifier.service.js';

@Controller('webhooks')
@UseGuards(TenantGuard)
export class WebhooksController {
  constructor(
    private readonly orchestrator: IntegrationOrchestratorService,
    private readonly registry: ProviderRegistry,
    private readonly verifier: WebhookSignatureVerifier,
    private readonly idempotency: IdempotencyService,
    private readonly crypto: IntegrationCryptoService
  ) {}

  @Post(':providerCode')
  handle(@CurrentContext() ctx: RequestContext, @Param('providerCode') providerCode: string, @Body() body: WebhookDto, @Headers('x-signature') signature?: string) {
    return this.process(ctx, providerCode, body.eventType ?? 'default', body, signature);
  }

  @Post(':providerCode/:eventType')
  handleByType(@CurrentContext() ctx: RequestContext, @Param('providerCode') providerCode: string, @Param('eventType') eventType: string, @Body() body: WebhookDto, @Headers('x-signature') signature?: string) {
    return this.process(ctx, providerCode, eventType, body, signature);
  }

  private async process(ctx: RequestContext, providerCode: string, eventType: string, body: WebhookDto, signature?: string) {
    this.verifier.verify(signature, process.env.INTEGRATION_WEBHOOK_SECRET);
    const dedupeKey = `${ctx.tenantId}:webhook:${providerCode}:${body.eventId ?? this.crypto.hashPayload(body.payload ?? body)}`;
    const duplicate = this.idempotency.get(dedupeKey);
    if (duplicate) {
      this.orchestrator.appendWebhookLog(ctx.tenantId!, { providerCode, entityType: 'webhook', entityId: body.eventId ?? 'hash', requestPayloadJsonb: body as Record<string, unknown>, responsePayloadJsonb: { duplicate: true }, statusCode: 200, status: 'duplicate' });
      return { accepted: true, duplicate: true };
    }
    const adapter = this.registry.resolve(providerCode);
    const result = await adapter.handleWebhook({ eventType, payload: body.payload ?? {} });
    this.idempotency.remember(dedupeKey, result);
    this.orchestrator.appendWebhookLog(ctx.tenantId!, { providerCode, entityType: 'webhook', entityId: body.eventId ?? result.externalId ?? 'unknown', requestPayloadJsonb: body as Record<string, unknown>, responsePayloadJsonb: result as Record<string, unknown>, statusCode: 202, status: 'accepted' });
    return { accepted: true, result };
  }
}
