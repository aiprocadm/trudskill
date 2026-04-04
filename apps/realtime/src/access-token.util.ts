import { createHmac, timingSafeEqual } from 'node:crypto';

/** Должно совпадать с `apps/backend/src/modules/iam/crypto-policy.ts` и логикой `crypto.util.ts`. */
const ACCESS_ALG = 'HS256' as const;
const ACCESS_TYP = 'JWT' as const;

const encodeBase64Url = (input: string): string => Buffer.from(input, 'utf-8').toString('base64url');
const decodeBase64Url = (input: string): string =>
  Buffer.from(input, 'base64url').toString('utf-8');

export interface AccessTokenClaims {
  sub: string;
  tenant_id: string;
  session_id: string;
  roles: string[];
  iat: number;
  exp: number;
}

/** Для тестов и симметрии с backend; в проде только verify. */
export const issueSignedAccessToken = (
  payload: Omit<AccessTokenClaims, 'iat' | 'exp'>,
  secret: string,
  ttlSeconds: number
): string => {
  const now = Math.floor(Date.now() / 1000);
  const claims: AccessTokenClaims = { ...payload, iat: now, exp: now + ttlSeconds };
  const header = encodeBase64Url(JSON.stringify({ alg: ACCESS_ALG, typ: ACCESS_TYP }));
  const encodedClaims = encodeBase64Url(JSON.stringify(claims));
  const signingInput = `${header}.${encodedClaims}`;
  const signature = createHmac('sha256', secret).update(signingInput).digest('base64url');
  return `${signingInput}.${signature}`;
};

export const verifySignedAccessToken = (token: string, secret: string): AccessTokenClaims => {
  const [encodedHeader, encodedClaims, signature] = token.split('.');
  if (!encodedHeader || !encodedClaims || !signature) {
    throw new Error('invalid_format');
  }

  const parsedHeader = JSON.parse(decodeBase64Url(encodedHeader)) as { alg?: string; typ?: string };
  if (parsedHeader.alg !== ACCESS_ALG || parsedHeader.typ !== ACCESS_TYP) {
    throw new Error('invalid_header');
  }

  const signingInput = `${encodedHeader}.${encodedClaims}`;
  const expected = createHmac('sha256', secret).update(signingInput).digest('base64url');
  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
    throw new Error('invalid_signature');
  }

  const claims = JSON.parse(decodeBase64Url(encodedClaims)) as Partial<AccessTokenClaims>;
  if (
    !claims.sub ||
    !claims.tenant_id ||
    !claims.session_id ||
    !Array.isArray(claims.roles) ||
    typeof claims.iat !== 'number' ||
    typeof claims.exp !== 'number'
  ) {
    throw new Error('invalid_claims');
  }

  if (claims.exp <= Math.floor(Date.now() / 1000)) {
    throw new Error('expired');
  }

  return claims as AccessTokenClaims;
};
