import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * TOTP (RFC 6238, HMAC-SHA1, 6 цифр, шаг 30с) на node:crypto — без внешних зависимостей,
 * в стиле остального IAM-крипто (см. crypto.util.ts: самописный HS256 вместо jsonwebtoken).
 * Проверено юнит-тестами на эталонных векторах приложения B RFC 6238.
 */

export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;
/** Допуск рассинхрона часов: текущий шаг ±1 (±30 секунд). */
export const TOTP_WINDOW = 1;
/** 20 байт секрета — рекомендация RFC 4226 §4 для HMAC-SHA1. */
const TOTP_SECRET_BYTES = 20;

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** RFC 4648 base32 без паддинга — формат секрета, который понимают все аутентификаторы. */
export function base32Encode(input: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of input) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

export function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new Error('invalid_base32');
    }
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret(): string {
  return base32Encode(randomBytes(TOTP_SECRET_BYTES));
}

/** Номер 30-секундного шага для момента времени (unix мс). */
export function totpStep(nowMs: number): number {
  return Math.floor(nowMs / 1000 / TOTP_STEP_SECONDS);
}

/** Код RFC 4226/6238 для конкретного шага. */
export function totpCodeForStep(secretBase32: string, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step), 0);
  const digest = createHmac('sha1', base32Decode(secretBase32)).update(counter).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    ((digest[offset + 1]! & 0xff) << 16) |
    ((digest[offset + 2]! & 0xff) << 8) |
    (digest[offset + 3]! & 0xff);
  return String(binary % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
}

export interface VerifyTotpOptions {
  nowMs: number;
  /**
   * Последний уже принятый шаг (iam.users.totp_last_used_step): шаги <= minStepExclusive
   * отклоняются, чтобы перехваченный код нельзя было ввести повторно (RFC 6238 §5.2).
   */
  minStepExclusive?: number | null;
}

/** Возвращает подошедший шаг (для записи в totp_last_used_step) либо null. */
export function verifyTotpCode(
  secretBase32: string,
  code: string,
  options: VerifyTotpOptions
): number | null {
  const normalized = code.trim();
  if (!/^\d{6}$/.test(normalized)) {
    return null;
  }
  const currentStep = totpStep(options.nowMs);
  for (let drift = -TOTP_WINDOW; drift <= TOTP_WINDOW; drift += 1) {
    const step = currentStep + drift;
    if (step < 0) continue;
    if (options.minStepExclusive != null && step <= options.minStepExclusive) continue;
    const expected = totpCodeForStep(secretBase32, step);
    if (timingSafeEqual(Buffer.from(expected), Buffer.from(normalized))) {
      return step;
    }
  }
  return null;
}

/** otpauth://-URL для QR: его понимают Google Authenticator, Яндекс.Ключ, 1Password и т.д. */
export function buildOtpauthUrl(params: {
  secretBase32: string;
  accountName: string;
  issuer: string;
}): string {
  const label = `${encodeURIComponent(params.issuer)}:${encodeURIComponent(params.accountName)}`;
  const query = new URLSearchParams({
    secret: params.secretBase32,
    issuer: params.issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS)
  });
  return `otpauth://totp/${label}?${query.toString()}`;
}

// ---------------------------------------------------------------------------
// Challenge второго шага логина: подписанный HMAC-SHA256 конверт (не JWT — чтобы
// его нельзя было перепутать с access-токеном и предъявить как bearer).
// ---------------------------------------------------------------------------

export const TOTP_CHALLENGE_TTL_SECONDS = 5 * 60;

export interface TotpChallengePayload {
  sub: string;
  tenant_id: string;
  method: 'password' | 'magic_link' | 'esia';
  database_backed: boolean;
  iat: number;
  exp: number;
}

const challengeHmac = (encodedPayload: string, secret: string): string =>
  createHmac('sha256', secret).update(`totp-challenge:${encodedPayload}`).digest('base64url');

export function signTotpChallenge(
  payload: Omit<TotpChallengePayload, 'iat' | 'exp'>,
  secret: string,
  nowMs: number
): string {
  const now = Math.floor(nowMs / 1000);
  const full: TotpChallengePayload = {
    ...payload,
    iat: now,
    exp: now + TOTP_CHALLENGE_TTL_SECONDS
  };
  const encoded = Buffer.from(JSON.stringify(full)).toString('base64url');
  return `${encoded}.${challengeHmac(encoded, secret)}`;
}

export function verifyTotpChallenge(
  token: string,
  secret: string,
  nowMs: number
): TotpChallengePayload {
  const [encoded, signature] = token.split('.');
  if (!encoded || !signature) {
    throw new Error('invalid_format');
  }
  const expected = challengeHmac(encoded, secret);
  const given = Buffer.from(signature);
  if (given.length !== Buffer.from(expected).length) {
    throw new Error('invalid_signature');
  }
  if (!timingSafeEqual(given, Buffer.from(expected))) {
    throw new Error('invalid_signature');
  }
  const payload = JSON.parse(
    Buffer.from(encoded, 'base64url').toString('utf-8')
  ) as Partial<TotpChallengePayload>;
  if (
    !payload.sub ||
    !payload.tenant_id ||
    !payload.method ||
    typeof payload.database_backed !== 'boolean' ||
    typeof payload.iat !== 'number' ||
    typeof payload.exp !== 'number'
  ) {
    throw new Error('invalid_claims');
  }
  if (payload.exp <= Math.floor(nowMs / 1000)) {
    throw new Error('expired');
  }
  return payload as TotpChallengePayload;
}
