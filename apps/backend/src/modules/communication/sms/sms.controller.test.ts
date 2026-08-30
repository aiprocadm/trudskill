import { describe, expect, it } from 'vitest';

import { InMemorySmsProviderSettingsRepository } from './in-memory-sms-provider-settings.repository.js';
import { SmsProviderSettingsService } from './sms-provider-settings.service.js';
import { SmsController } from './sms.controller.js';

import type { RequestContext } from '../../../common/context/request-context.js';

/**
 * Настройка СМС-поставщика центром (журнал 309).
 *
 * Служба и оба хранилища были написаны и покрыты тестами, право `sms.configure` выдавалось
 * администрации миграцией `0068` — а ручки, из которой вызывается `save()`, не существовало.
 * Значение по умолчанию «выключено, noop» означало, что второй канал доставки (ФТ-C1.3)
 * нельзя было включить иначе как правкой строки в базе.
 */
const ctxFor = (tenantId: string) =>
  ({ tenantId, userId: 'u_1', requestId: 'r1', correlationId: 'c1' }) as RequestContext;

function harness() {
  const settings = new SmsProviderSettingsService(new InMemorySmsProviderSettingsRepository());
  return { controller: new SmsController(settings), settings };
}

describe('SmsController — настройка поставщика СМС', () => {
  it('без сохранённых настроек отдаёт безопасный вид: выключено и noop', async () => {
    const h = harness();

    const result = await h.controller.getSettings(ctxFor('t1'));

    expect(result.providerCode).toBe('noop');
    expect(result.enabled).toBe(false);
  });

  it('сохранённое возвращается следующим чтением — за СМС платит центр, настройка обязана дожить', async () => {
    const h = harness();

    await h.controller.saveSettings(ctxFor('t1'), {
      providerCode: 'smsc',
      senderName: 'TRUDSKILL',
      enabled: true
    });
    const result = await h.controller.getSettings(ctxFor('t1'));

    expect(result.providerCode).toBe('smsc');
    expect(result.senderName).toBe('TRUDSKILL');
    expect(result.enabled).toBe(true);
  });

  it('настройка одного центра не видна соседнему', async () => {
    const h = harness();

    await h.controller.saveSettings(ctxFor('t1'), { providerCode: 'smsc', enabled: true });
    const neighbour = await h.controller.getSettings(ctxFor('t2'));

    expect(neighbour.providerCode).toBe('noop');
    expect(neighbour.enabled).toBe(false);
  });

  it('неизвестный поставщик отбивается ДО службы', async () => {
    const h = harness();

    expect(() =>
      h.controller.saveSettings(ctxFor('t1'), { providerCode: 'telegram', enabled: true })
    ).toThrow(/providerCode/);
    await expect(h.controller.getSettings(ctxFor('t1'))).resolves.toMatchObject({
      providerCode: 'noop'
    });
  });

  it('пропущенный признак «включено» отбивается: молчаливое умолчание тут опасно', () => {
    const h = harness();

    expect(() => h.controller.saveSettings(ctxFor('t1'), { providerCode: 'smsc' })).toThrow(
      /enabled/
    );
  });
});
