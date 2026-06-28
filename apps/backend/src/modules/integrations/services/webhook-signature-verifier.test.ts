import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { WebhookSignatureVerifier } from './webhook-signature-verifier.service.js';

describe('WebhookSignatureVerifier', () => {
  it('accepts callbacks when provider secret is disabled', () => {
    const verifier = new WebhookSignatureVerifier();

    expect(() => verifier.verify(undefined, undefined)).not.toThrow();
  });

  it('rejects callback when signature is missing but secret is configured', () => {
    const verifier = new WebhookSignatureVerifier();

    expect(() => verifier.verify(undefined, 'provider-secret')).toThrow(ForbiddenException);
  });

  it('rejects callback when signature does not match secret', () => {
    const verifier = new WebhookSignatureVerifier();

    expect(() => verifier.verify('wrong-signature', 'provider-secret')).toThrow(ForbiddenException);
  });

  it('accepts a signature equal to the configured secret (constant-time compare)', () => {
    const verifier = new WebhookSignatureVerifier();

    expect(() => verifier.verify('provider-secret', 'provider-secret')).not.toThrow();
  });

  it('rejects a signature that is a prefix of the secret (no length-based shortcut)', () => {
    const verifier = new WebhookSignatureVerifier();

    expect(() => verifier.verify('provider', 'provider-secret')).toThrow(ForbiddenException);
  });
});
