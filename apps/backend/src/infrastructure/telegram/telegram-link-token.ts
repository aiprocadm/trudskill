import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Токен привязки Telegram к учётной записи (`ФТ-F3`).
 *
 * Человек открывает в кабинете ссылку вида `https://t.me/<бот>?start=<токен>` — бот получает
 * токен первым же сообщением и понимает, чей это чат.
 *
 * **Почему подписанный токен, а не запись в базе.** Хранимый одноразовый код требует таблицы,
 * уборки протухших и второго источника правды о том, кто с кем связан. Подпись даёт то же
 * самое без хранения: она подтверждает, что токен выдали мы, а срок жизни зашит внутрь.
 * Ровно так же сделана метка состояния для входа через Госуслуги (`esia-state.ts`).
 *
 * Токен НЕ является пропуском: он лишь называет, кого привязать. Прочитать чужое обучение по
 * нему нельзя — бот отвечает только в тот чат, который сам и привязан.
 */

export interface TelegramLinkClaims {
  tenantId: string;
  userId: string;
}

interface TelegramLinkPayload extends TelegramLinkClaims {
  exp: number;
}

const b64 = (s: string): string => Buffer.from(s, 'utf8').toString('base64url');
const unb64 = (s: string): string => Buffer.from(s, 'base64url').toString('utf8');
const hmac = (body: string, secret: string): string =>
  createHmac('sha256', secret).update(body).digest('base64url');

export const signTelegramLink = (
  claims: TelegramLinkClaims,
  secret: string,
  ttlSeconds: number,
  nowMs: number
): string => {
  const payload: TelegramLinkPayload = { ...claims, exp: nowMs + ttlSeconds * 1000 };
  const body = b64(JSON.stringify(payload));
  return `${body}.${hmac(body, secret)}`;
};

/** Бросает при подделке, порче и истечении срока — молча привязывать чужой чат нельзя. */
export const verifyTelegramLink = (
  token: string,
  secret: string,
  nowMs: number
): TelegramLinkClaims => {
  const [body, sig] = token.split('.');
  if (!body || !sig) throw new Error('telegram_link_malformed');
  const expected = hmac(body, secret);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b))
    throw new Error('telegram_link_bad_signature');
  const payload = JSON.parse(unb64(body)) as TelegramLinkPayload;
  if (typeof payload.exp !== 'number' || nowMs > payload.exp)
    throw new Error('telegram_link_expired');
  return { tenantId: payload.tenantId, userId: payload.userId };
};
