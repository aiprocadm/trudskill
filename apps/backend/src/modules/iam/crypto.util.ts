import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export const hashPassword = (password: string): string =>
  createHash('sha256').update(`pwd:${password}`).digest('hex');

export const verifyPassword = (plain: string, hash: string): boolean => hashPassword(plain) === hash;

export interface AccessTokenClaims {
  sub: string;
  tenant_id: string;
  session_id: string;
  roles: string[];
  iat: number;
  exp: number;
}

const encodeBase64Url = (input: string): string => Buffer.from(input).toString('base64url');
const decodeBase64Url = (input: string): string => Buffer.from(input, 'base64url').toString('utf-8');

export const issueSignedAccessToken = (
  payload: Omit<AccessTokenClaims, 'iat' | 'exp'>,
  secret: string,
  ttlSeconds: number
): string => {
  const now = Math.floor(Date.now() / 1000);
  const claims: AccessTokenClaims = { ...payload, iat: now, exp: now + ttlSeconds };
  const encodedClaims = encodeBase64Url(JSON.stringify(claims));
  const signature = createHmac('sha256', secret).update(encodedClaims).digest('base64url');
  return `${encodedClaims}.${signature}`;
};

export const verifySignedAccessToken = (token: string, secret: string): AccessTokenClaims => {
  const [encodedClaims, signature] = token.split('.');
  if (!encodedClaims || !signature) {
    throw new Error('invalid_format');
  }

  const expected = createHmac('sha256', secret).update(encodedClaims).digest('base64url');
  if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) {
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

export const issueToken = (): string => randomUUID();

export const hashRefreshToken = (token: string): string =>
  createHash('sha256').update(`refresh:${token}`).digest('hex');
