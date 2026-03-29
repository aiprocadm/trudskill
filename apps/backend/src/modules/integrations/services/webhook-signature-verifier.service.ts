import { ForbiddenException, Injectable } from '@nestjs/common';

@Injectable()
export class WebhookSignatureVerifier {
  verify(signature: string | undefined, secret: string | undefined): void {
    if (!secret) return;
    if (!signature || signature !== secret) {
      throw new ForbiddenException({ code: 'forbidden', message: 'Invalid webhook signature' });
    }
  }
}
