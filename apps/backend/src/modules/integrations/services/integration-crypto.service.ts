import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';

@Injectable()
export class IntegrationCryptoService {
  encrypt(raw: string): string { return Buffer.from(raw, 'utf8').toString('base64'); }
  decrypt(encrypted: string): string { return Buffer.from(encrypted, 'base64').toString('utf8'); }
  maskSecret(secret: string): string {
    if (!secret.length) return '***';
    return `${secret.slice(0, 2)}***${secret.slice(-2)}`;
  }
  hashPayload(payload: unknown): string { return createHash('sha256').update(JSON.stringify(payload)).digest('hex'); }
}
