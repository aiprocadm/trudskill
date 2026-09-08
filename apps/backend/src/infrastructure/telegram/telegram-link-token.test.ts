import { describe, expect, it } from 'vitest';

import { signTelegramLink, verifyTelegramLink } from './telegram-link-token.js';

const SECRET = 'секрет-бота';
const NOW = Date.UTC(2026, 8, 8, 12, 0, 0);

describe('ФТ-F3 · токен привязки Telegram', () => {
  it('свой токен читается обратно', () => {
    const token = signTelegramLink({ tenantId: 't1', userId: 'u1' }, SECRET, 900, NOW);
    expect(verifyTelegramLink(token, SECRET, NOW + 1000)).toEqual({ tenantId: 't1', userId: 'u1' });
  });

  it('подделанный токен отвергается', () => {
    /* Иначе кто угодно привязал бы к себе чужой чат и читал чужие уведомления. */
    const token = signTelegramLink({ tenantId: 't1', userId: 'u1' }, SECRET, 900, NOW);
    const [body] = token.split('.');
    const forged = `${body}.подпись`;
    expect(() => verifyTelegramLink(forged, SECRET, NOW)).toThrow(/signature|malformed/);
  });

  it('токен, подписанный ЧУЖИМ секретом, не подходит', () => {
    const token = signTelegramLink({ tenantId: 't1', userId: 'u1' }, 'другой-секрет', 900, NOW);
    expect(() => verifyTelegramLink(token, SECRET, NOW)).toThrow(/signature/);
  });

  it('просроченный токен не подходит', () => {
    const token = signTelegramLink({ tenantId: 't1', userId: 'u1' }, SECRET, 900, NOW);
    expect(() => verifyTelegramLink(token, SECRET, NOW + 901_000)).toThrow(/expired/);
  });

  it('подменённое содержимое ломает подпись', () => {
    /* Подпись покрывает и арендатора, и человека: иначе можно было бы подставить чужой id. */
    const token = signTelegramLink({ tenantId: 't1', userId: 'u1' }, SECRET, 900, NOW);
    const [, sig] = token.split('.');
    const swapped = Buffer.from(
      JSON.stringify({ tenantId: 't1', userId: 'u2', exp: NOW + 1e6 })
    ).toString('base64url');
    expect(() => verifyTelegramLink(`${swapped}.${sig}`, SECRET, NOW)).toThrow(/signature/);
  });
});
