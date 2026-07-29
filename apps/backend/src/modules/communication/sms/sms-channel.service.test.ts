import { describe, expect, it } from 'vitest';

import { InMemorySmsProviderSettingsRepository } from './in-memory-sms-provider-settings.repository.js';
import { SmsChannelService } from './sms-channel.service.js';
import { SmsProviderSettingsService } from './sms-provider-settings.service.js';
import { FakeSmsProvider } from '../../../infrastructure/sms-provider/fake-sms.provider.js';
import {
  NoopSmsProvider,
  type SmsProvider,
  type SmsProviderRegistry
} from '../../../infrastructure/sms-provider/sms.provider.js';

function makeChannel(nodeEnv = 'test') {
  const repo = new InMemorySmsProviderSettingsRepository();
  const settings = new SmsProviderSettingsService(repo);
  const fake = new FakeSmsProvider();
  const registry: SmsProviderRegistry = new Map<string, SmsProvider>([
    ['noop', new NoopSmsProvider()],
    ['fake', fake]
  ]) as SmsProviderRegistry;
  return { channel: new SmsChannelService(registry, settings, nodeEnv), settings, fake };
}

describe('SmsChannelService', () => {
  it('по умолчанию канал выключен — тенант, не покупавший СМС, ничего не шлёт', async () => {
    const { channel, fake } = makeChannel();
    await expect(channel.send('t1', '+79991234567', 'ссылка')).resolves.toBe(false);
    expect(fake.sent).toHaveLength(0);
  });

  it('включённый канал доставляет тот же текст', async () => {
    const { channel, settings, fake } = makeChannel();
    await settings.save('t1', { providerCode: 'fake', enabled: true });

    await expect(channel.send('t1', '8 (999) 123-45-67', 'ссылка на экзамен')).resolves.toBe(true);
    expect(fake.sent).toHaveLength(1);
    // Номер нормализован до провайдера — оператор не обязан разбирать человеческий ввод.
    expect(fake.sent[0]?.to).toBe('+79991234567');
    expect(fake.sent[0]?.text).toBe('ссылка на экзамен');
  });

  it('передаёт имя отправителя, зарегистрированное тенантом', async () => {
    const { channel, settings, fake } = makeChannel();
    await settings.save('t1', { providerCode: 'fake', enabled: true, senderName: 'UC-PROF' });

    await channel.send('t1', '+79991234567', 'текст');
    expect(fake.sent[0]?.senderName).toBe('UC-PROF');
  });

  it('выключённый флаг гасит канал, даже если провайдер выбран', async () => {
    const { channel, settings, fake } = makeChannel();
    await settings.save('t1', { providerCode: 'fake', enabled: false });

    await expect(channel.send('t1', '+79991234567', 'текст')).resolves.toBe(false);
    expect(fake.sent).toHaveLength(0);
  });

  it('в production подделка принудительно опускается до noop', async () => {
    const { channel, settings, fake } = makeChannel('production');
    await settings.save('t1', { providerCode: 'fake', enabled: true });

    await expect(channel.send('t1', '+79991234567', 'текст')).resolves.toBe(false);
    expect(fake.sent).toHaveLength(0);
  });

  it('нет телефона или телефон мусорный — тихо false, без обращения к оператору', async () => {
    const { channel, settings, fake } = makeChannel();
    await settings.save('t1', { providerCode: 'fake', enabled: true });

    await expect(channel.send('t1', undefined, 'текст')).resolves.toBe(false);
    await expect(channel.send('t1', 'нет телефона', 'текст')).resolves.toBe(false);
    expect(fake.sent).toHaveLength(0);
  });

  it('падение оператора не выпускает исключение наружу', async () => {
    const { settings } = makeChannel();
    const exploding: SmsProvider = {
      code: 'smsc',
      send: async () => {
        throw new Error('gateway 500');
      }
    };
    const registry: SmsProviderRegistry = new Map<string, SmsProvider>([
      ['smsc', exploding]
    ]) as SmsProviderRegistry;
    const channel = new SmsChannelService(registry, settings, 'test');
    await settings.save('t1', { providerCode: 'smsc', enabled: true });

    await expect(channel.send('t1', '+79991234567', 'текст')).resolves.toBe(false);
  });

  it('незарегистрированный код провайдера деградирует в noop, а не в ошибку', async () => {
    const { channel, settings } = makeChannel();
    await settings.save('t1', { providerCode: 'mts', enabled: true });

    await expect(channel.send('t1', '+79991234567', 'текст')).resolves.toBe(false);
  });

  it('настройки тенантов не протекают друг в друга', async () => {
    const { channel, settings, fake } = makeChannel();
    await settings.save('t1', { providerCode: 'fake', enabled: true });

    await expect(channel.send('t2', '+79991234567', 'текст')).resolves.toBe(false);
    expect(fake.sent).toHaveLength(0);
  });
});
