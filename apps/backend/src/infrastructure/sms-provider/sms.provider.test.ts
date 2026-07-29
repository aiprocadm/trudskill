import { describe, expect, it } from 'vitest';

import { FakeSmsProvider } from './fake-sms.provider.js';
import { normalizePhone } from './phone.util.js';
import { NoopSmsProvider } from './sms.provider.js';

describe('NoopSmsProvider', () => {
  it('называет себя noop', () => {
    expect(new NoopSmsProvider().code).toBe('noop');
  });

  it('отвечает null и НЕ бросает — спящий канал не имеет права уронить доменный флоу', async () => {
    const provider = new NoopSmsProvider();
    await expect(
      provider.send({ tenantId: 't1', to: '+79991234567', text: 'код' })
    ).resolves.toBeNull();
  });
});

describe('FakeSmsProvider', () => {
  it('запоминает отправленное и помечает идентификатор как поддельный', async () => {
    const provider = new FakeSmsProvider();
    const res = await provider.send({ tenantId: 't1', to: '+79991234567', text: 'ссылка' });

    expect(res?.providerMessageId).toBe('fake-sms:1');
    expect(provider.sent).toHaveLength(1);
    expect(provider.sent[0]?.to).toBe('+79991234567');
  });

  it('отказывает на ненормализованный номер, а не делает вид, что доставил', async () => {
    const provider = new FakeSmsProvider();
    await expect(
      provider.send({ tenantId: 't1', to: '89991234567', text: 'x' })
    ).resolves.toBeNull();
    expect(provider.sent).toHaveLength(0);
  });

  it('отказывает на пустой текст', async () => {
    const provider = new FakeSmsProvider();
    await expect(
      provider.send({ tenantId: 't1', to: '+79991234567', text: '' })
    ).resolves.toBeNull();
  });

  it('считает сегменты по 70 символов — кириллица дробит СМС именно так', async () => {
    const provider = new FakeSmsProvider();
    const res = await provider.send({ tenantId: 't1', to: '+79991234567', text: 'я'.repeat(71) });
    expect(res?.segments).toBe(2);
  });
});

describe('normalizePhone', () => {
  it('приводит российские записи к одному виду', () => {
    expect(normalizePhone('8 (999) 123-45-67')).toBe('+79991234567');
    expect(normalizePhone('+7 999 123 45 67')).toBe('+79991234567');
    expect(normalizePhone('79991234567')).toBe('+79991234567');
    expect(normalizePhone('9991234567')).toBe('+79991234567');
  });

  it('НЕ трогает «восьмёрку» после плюса — это другая страна, а не наш формат', () => {
    // +8 — код Восточной Азии; переписать его в +7 значило бы отправить СМС не тому.
    expect(normalizePhone('+8 999 123 45 67')).toBe('+89991234567');
  });

  it('сохраняет международные номера как есть', () => {
    expect(normalizePhone('+375 29 123-45-67')).toBe('+375291234567');
  });

  it('возвращает null на мусор вместо отправки в никуда', () => {
    expect(normalizePhone(undefined)).toBeNull();
    expect(normalizePhone('')).toBeNull();
    expect(normalizePhone('   ')).toBeNull();
    expect(normalizePhone('нет телефона')).toBeNull();
    expect(normalizePhone('123')).toBeNull();
    expect(normalizePhone('1234567890123456')).toBeNull();
  });
});
