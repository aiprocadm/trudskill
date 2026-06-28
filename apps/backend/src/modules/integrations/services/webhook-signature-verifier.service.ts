import { createHash, timingSafeEqual } from 'node:crypto';

import { ForbiddenException, Injectable } from '@nestjs/common';

@Injectable()
export class WebhookSignatureVerifier {
  verify(signature: string | undefined, secret: string | undefined): void {
    // The secret is mandatory in production/staging/prod-profile (enforced by
    // env.schema); it is unset only in local dev/test, where verification is
    // intentionally skipped.
    if (!secret) return;
    if (!signature || !this.constantTimeEqual(signature, secret)) {
      throw new ForbiddenException({ code: 'forbidden', message: 'Invalid webhook signature' });
    }
  }

  /**
   * Constant-time comparison of a static shared secret. Hash both sides to a
   * fixed-length digest first so timingSafeEqual never sees unequal-length buffers
   * (which would otherwise leak the secret length via an early return).
   */
  private constantTimeEqual(a: string, b: string): boolean {
    const ad = createHash('sha256').update(a).digest();
    const bd = createHash('sha256').update(b).digest();
    return timingSafeEqual(ad, bd);
  }
}
