import { Module } from '@nestjs/common';

import { WebhookSignatureVerifier } from '../services/webhook-signature-verifier.service.js';

@Module({
  providers: [WebhookSignatureVerifier],
  exports: [WebhookSignatureVerifier]
})
export class WebhooksModule {}
