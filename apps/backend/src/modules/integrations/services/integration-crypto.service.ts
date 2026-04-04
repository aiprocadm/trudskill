import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

type Keyring = {
  activeVersion: string;
  keys: Map<string, Buffer>;
};

const ENCRYPTION_PREFIX = 'enc';
const ENCRYPTION_ALGO = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12;

@Injectable()
export class IntegrationCryptoService {
  private readonly keyring: Keyring;

  constructor() {
    this.keyring = this.loadKeyring();
  }

  encrypt(raw: string): string {
    const key = this.keyring.keys.get(this.keyring.activeVersion);
    if (!key) {
      throw new Error(`Active integration key version \"${this.keyring.activeVersion}\" is not configured`);
    }

    const iv = randomBytes(IV_LENGTH_BYTES);
    const cipher = createCipheriv(ENCRYPTION_ALGO, key, iv);
    const encrypted = Buffer.concat([cipher.update(raw, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return [
      ENCRYPTION_PREFIX,
      this.keyring.activeVersion,
      iv.toString('base64url'),
      authTag.toString('base64url'),
      encrypted.toString('base64url')
    ].join(':');
  }

  decrypt(encrypted: string): string {
    const parsed = this.parseCiphertext(encrypted);

    if (!parsed) {
      // Backward compatibility for previously persisted Base64-only secrets.
      return Buffer.from(encrypted, 'base64').toString('utf8');
    }

    const key = this.keyring.keys.get(parsed.version);
    if (!key) {
      throw new Error(`Integration key version \"${parsed.version}\" is not available`);
    }

    const decipher = createDecipheriv(ENCRYPTION_ALGO, key, parsed.iv);
    decipher.setAuthTag(parsed.authTag);

    const decrypted = Buffer.concat([decipher.update(parsed.ciphertext), decipher.final()]);
    return decrypted.toString('utf8');
  }

  maskSecret(secret: string): string {
    if (!secret.length) return '***';
    return `${secret.slice(0, 2)}***${secret.slice(-2)}`;
  }

  maskEncryptedSecret(encrypted: string): string {
    return this.maskSecret(this.decrypt(encrypted));
  }

  hashPayload(payload: unknown): string { return createHash('sha256').update(JSON.stringify(payload)).digest('hex'); }

  private loadKeyring(): Keyring {
    const keysRaw = process.env.INTEGRATION_CRYPTO_KEYS;
    const activeVersion = process.env.INTEGRATION_CRYPTO_ACTIVE_KEY_VERSION;

    if (!keysRaw) {
      if (process.env.NODE_ENV === 'production') {
        throw new Error('INTEGRATION_CRYPTO_KEYS must be configured in production');
      }

      const fallback = Buffer.from('0123456789abcdef0123456789abcdef', 'utf8');
      return { activeVersion: 'v1', keys: new Map([['v1', fallback]]) };
    }

    const keys = new Map<string, Buffer>();
    for (const entry of keysRaw.split(',').map((part) => part.trim()).filter(Boolean)) {
      const [version, encoded] = entry.split(':');
      if (!version || !encoded) {
        throw new Error('INTEGRATION_CRYPTO_KEYS must be provided as "version:base64key" CSV list');
      }

      const key = Buffer.from(encoded, 'base64');
      if (key.length !== 32) {
        throw new Error(`Integration key ${version} must decode to 32 bytes`);
      }

      keys.set(version, key);
    }

    const chosenActiveVersion = activeVersion ?? [...keys.keys()][0];
    if (!chosenActiveVersion || !keys.has(chosenActiveVersion)) {
      throw new Error('INTEGRATION_CRYPTO_ACTIVE_KEY_VERSION must match one of INTEGRATION_CRYPTO_KEYS versions');
    }

    return { activeVersion: chosenActiveVersion, keys };
  }

  private parseCiphertext(encrypted: string): { version: string; iv: Buffer; authTag: Buffer; ciphertext: Buffer } | null {
    const parts = encrypted.split(':');
    if (parts.length !== 5 || parts[0] !== ENCRYPTION_PREFIX) {
      return null;
    }

    const [, version, iv, authTag, ciphertext] = parts;
    return {
      version,
      iv: Buffer.from(iv, 'base64url'),
      authTag: Buffer.from(authTag, 'base64url'),
      ciphertext: Buffer.from(ciphertext, 'base64url')
    };
  }
}
