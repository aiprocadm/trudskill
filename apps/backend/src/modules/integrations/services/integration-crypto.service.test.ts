import { afterEach, describe, expect, it } from 'vitest';
import { IntegrationCryptoService } from './integration-crypto.service.js';

const ORIGINAL_ENV = { ...process.env };

const encodeKey = (input: string) => Buffer.from(input, 'utf8').toString('base64');

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('IntegrationCryptoService', () => {
  it('encrypts with AES-GCM envelope and not plain base64', () => {
    process.env.INTEGRATION_CRYPTO_KEYS = `v1:${encodeKey('0123456789abcdef0123456789abcdef')}`;
    process.env.INTEGRATION_CRYPTO_ACTIVE_KEY_VERSION = 'v1';

    const crypto = new IntegrationCryptoService();
    const secret = 'super-secret-token';
    const encrypted = crypto.encrypt(secret);

    expect(encrypted.startsWith('enc:v1:')).toBe(true);
    expect(crypto.decrypt(encrypted)).toBe(secret);
    expect(Buffer.from(encrypted, 'base64').toString('utf8')).not.toBe(secret);
  });

  it('supports key rotation with versioned key material', () => {
    const v1 = encodeKey('0123456789abcdef0123456789abcdef');
    const v2 = encodeKey('abcdef0123456789abcdef0123456789');

    process.env.INTEGRATION_CRYPTO_KEYS = `v1:${v1},v2:${v2}`;
    process.env.INTEGRATION_CRYPTO_ACTIVE_KEY_VERSION = 'v1';
    const oldCrypto = new IntegrationCryptoService();
    const oldEncrypted = oldCrypto.encrypt('legacy-secret');

    process.env.INTEGRATION_CRYPTO_ACTIVE_KEY_VERSION = 'v2';
    const rotatedCrypto = new IntegrationCryptoService();
    const newEncrypted = rotatedCrypto.encrypt('new-secret');

    expect(rotatedCrypto.decrypt(oldEncrypted)).toBe('legacy-secret');
    expect(rotatedCrypto.decrypt(newEncrypted)).toBe('new-secret');
    expect(newEncrypted.startsWith('enc:v2:')).toBe(true);
  });

  it('can still read legacy base64 payloads during migration window', () => {
    process.env.INTEGRATION_CRYPTO_KEYS = `v1:${encodeKey('0123456789abcdef0123456789abcdef')}`;
    const crypto = new IntegrationCryptoService();

    const legacy = Buffer.from('legacy-secret', 'utf8').toString('base64');
    expect(crypto.decrypt(legacy)).toBe('legacy-secret');
  });
});
