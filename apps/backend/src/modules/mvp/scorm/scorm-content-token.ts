import { createHmac, timingSafeEqual } from 'node:crypto';

export interface ScormContentTokenPayload {
  tenantId: string;
  packageId: string;
  exp: number;
}

/** `base64url(json).base64url(hmac-sha256)` — токен в пути URL, поэтому только base64url-символы. */
export function createScormContentToken(
  input: { tenantId: string; packageId: string },
  secret: string,
  opts: { ttlSeconds: number; nowEpochSeconds: number }
): string {
  const payload: ScormContentTokenPayload = {
    tenantId: input.tenantId,
    packageId: input.packageId,
    exp: opts.nowEpochSeconds + opts.ttlSeconds
  };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

/** null при любой проблеме (битый формат, подпись, exp) — роут отвечает 404/403 без деталей. */
export function verifyScormContentToken(
  token: string,
  secret: string,
  opts: { nowEpochSeconds: number }
): ScormContentTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts as [string, string];
  const expected = createHmac('sha256', secret).update(body).digest();
  let actual: Buffer;
  try {
    actual = Buffer.from(sig, 'base64url');
  } catch {
    return null;
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  let payload: ScormContentTokenPayload;
  try {
    payload = JSON.parse(
      Buffer.from(body, 'base64url').toString('utf8')
    ) as ScormContentTokenPayload;
  } catch {
    return null;
  }
  if (
    typeof payload.tenantId !== 'string' ||
    typeof payload.packageId !== 'string' ||
    typeof payload.exp !== 'number' ||
    payload.exp <= opts.nowEpochSeconds
  ) {
    return null;
  }
  return payload;
}
