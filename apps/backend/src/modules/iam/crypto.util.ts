import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

import { iamCryptoPolicy } from './crypto-policy.js';

export const hashPassword = (password: string): string => {
  const salt = randomBytes(iamCryptoPolicy.password.saltLength);
  const derivedKey = scryptSync(password, salt, iamCryptoPolicy.password.keyLength, {
    N: iamCryptoPolicy.password.cost,
    r: iamCryptoPolicy.password.blockSize,
    p: iamCryptoPolicy.password.parallelization
  });

  return [
    iamCryptoPolicy.password.algorithm,
    iamCryptoPolicy.password.cost,
    iamCryptoPolicy.password.blockSize,
    iamCryptoPolicy.password.parallelization,
    salt.toString('base64url'),
    derivedKey.toString('base64url')
  ].join('$');
};

export const verifyPassword = (plain: string, hash: string): boolean => {
  const [algorithm, costRaw, blockSizeRaw, parallelizationRaw, encodedSalt, encodedHash] =
    hash.split('$');
  if (
    algorithm !== iamCryptoPolicy.password.algorithm ||
    !costRaw ||
    !blockSizeRaw ||
    !parallelizationRaw ||
    !encodedSalt ||
    !encodedHash
  ) {
    return false;
  }

  const salt = Buffer.from(encodedSalt, 'base64url');
  const stored = Buffer.from(encodedHash, 'base64url');
  const computed = scryptSync(plain, salt, stored.length, {
    N: Number(costRaw),
    r: Number(blockSizeRaw),
    p: Number(parallelizationRaw)
  });

  return timingSafeEqual(computed, stored);
};

export interface AccessTokenClaims {
  sub: string;
  tenant_id: string;
  session_id: string;
  roles: string[];
  iat: number;
  exp: number;
}

const encodeBase64Url = (input: string): string => Buffer.from(input).toString('base64url');
const decodeBase64Url = (input: string): string =>
  Buffer.from(input, 'base64url').toString('utf-8');

export const issueSignedAccessToken = (
  payload: Omit<AccessTokenClaims, 'iat' | 'exp'>,
  secret: string,
  ttlSeconds: number
): string => {
  const now = Math.floor(Date.now() / 1000);
  const claims: AccessTokenClaims = { ...payload, iat: now, exp: now + ttlSeconds };
  const header = encodeBase64Url(
    JSON.stringify({
      alg: iamCryptoPolicy.accessToken.algorithm,
      typ: iamCryptoPolicy.accessToken.type
    })
  );
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
  if (
    parsedHeader.alg !== iamCryptoPolicy.accessToken.algorithm ||
    parsedHeader.typ !== iamCryptoPolicy.accessToken.type
  ) {
    throw new Error('invalid_header');
  }

  const signingInput = `${encodedHeader}.${encodedClaims}`;
  const expected = createHmac('sha256', secret).update(signingInput).digest('base64url');
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

export const issueToken = (): string =>
  randomBytes(iamCryptoPolicy.refreshToken.bytes).toString('base64url');

export const hashRefreshToken = (token: string, secret: string): string =>
  createHmac('sha256', secret).update(`refresh:${token}`).digest('hex');
