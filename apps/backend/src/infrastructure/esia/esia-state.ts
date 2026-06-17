import { createHmac, timingSafeEqual } from 'node:crypto';

import { type EsiaPurpose } from './esia-identity.provider.js';

export interface EsiaStateClaims {
  purpose: EsiaPurpose;
  tenantId: string;
  nonce: string;
  /** Present only for the identity flow — the learner whose СНИЛС must match ЕСИА. */
  learnerId?: string;
}

interface EsiaStatePayload extends EsiaStateClaims {
  exp: number; // epoch ms
}

const b64 = (s: string): string => Buffer.from(s, 'utf8').toString('base64url');
const unb64 = (s: string): string => Buffer.from(s, 'base64url').toString('utf8');

const hmac = (body: string, secret: string): string =>
  createHmac('sha256', secret).update(body).digest('base64url');

export const signEsiaState = (
  claims: EsiaStateClaims,
  secret: string,
  ttlSeconds: number,
  nowMs: number
): string => {
  const payload: EsiaStatePayload = { ...claims, exp: nowMs + ttlSeconds * 1000 };
  const body = b64(JSON.stringify(payload));
  return `${body}.${hmac(body, secret)}`;
};

export const verifyEsiaState = (token: string, secret: string, nowMs: number): EsiaStateClaims => {
  const [body, sig] = token.split('.');
  if (!body || !sig) throw new Error('esia_state_malformed');
  const expected = hmac(body, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new Error('esia_state_bad_signature');
  const payload = JSON.parse(unb64(body)) as EsiaStatePayload;
  if (typeof payload.exp !== 'number' || nowMs > payload.exp) throw new Error('esia_state_expired');
  return {
    purpose: payload.purpose,
    tenantId: payload.tenantId,
    nonce: payload.nonce,
    learnerId: payload.learnerId
  };
};
