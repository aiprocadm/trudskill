import { describe, expect, it, vi } from 'vitest';

import { YookassaRentalBillingProvider } from './yookassa-rental-billing.provider.js';

const CFG = {
  shopId: 'shop_1',
  secretKey: 'secret',
  returnUrl: 'https://trudskill.ru/platform/rental-invoices',
  apiBase: 'https://api.example.test/v3',
  allowedIps: [],
  ipCheckEnabled: false
};

const DRAFT = {
  invoiceId: 'inv_1',
  tenantId: 'tenant_demo',
  tenantName: 'Учебный центр «Пример»',
  number: 'АР-000123',
  periodStart: '2026-09-01',
  periodEnd: '2026-09-30',
  amountKopecks: 1_500_00,
  currency: 'RUB',
  dueAt: '2026-10-10'
};

const jsonResponse = (body: unknown, ok = true) =>
  ({ ok, status: ok ? 200 : 500, json: async () => body }) as Response;

describe('ФТ-D5.2 · автоплатёж за аренду', () => {
  it('счёт получает ссылку на оплату и идентификатор платежа в банке', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        id: 'pay_yk_1',
        confirmation: { confirmation_url: 'https://yoomoney.test/checkout/pay_yk_1' }
      })
    );
    const provider = new YookassaRentalBillingProvider(CFG, fetchImpl as unknown as typeof fetch);

    const result = await provider.issue(DRAFT);

    expect(result).toEqual({
      providerInvoiceId: 'pay_yk_1',
      paymentUrl: 'https://yoomoney.test/checkout/pay_yk_1'
    });
  });

  it('идентификатор счёта идёт ключом идемпотентности — повтор не создаёт второй платёж', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ id: 'pay_yk_1' }));
    const provider = new YookassaRentalBillingProvider(CFG, fetchImpl as unknown as typeof fetch);

    await provider.issue(DRAFT);

    const headers = fetchImpl.mock.calls[0]![1].headers as Record<string, string>;
    expect(headers['Idempotence-Key']).toBe('inv_1');
  });

  it('сумма уходит в рублях, а не в копейках', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ id: 'pay_yk_1' }));
    const provider = new YookassaRentalBillingProvider(CFG, fetchImpl as unknown as typeof fetch);

    await provider.issue(DRAFT);

    const body = JSON.parse(fetchImpl.mock.calls[0]![1].body as string);
    expect(body.amount).toEqual({ value: '1500.00', currency: 'RUB' });
  });

  it('недоступный банк НЕ отменяет счёт — возвращается null, а не исключение', async () => {
    /*
     * Счёт уже создан в базе к моменту вызова. Если бы адаптер бросал, сбой банка отменял
     * бы обязательство платить — и счёт исчезал бы вместе с ним.
     */
    const fetchImpl = vi.fn().mockRejectedValue(new Error('сеть недоступна'));
    const provider = new YookassaRentalBillingProvider(CFG, fetchImpl as unknown as typeof fetch);

    await expect(provider.issue(DRAFT)).resolves.toBeNull();
  });

  it('уведомление не принимается на веру: состояние платежа переспрашивается у банка', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ id: 'pay_yk_1', status: 'succeeded', amount: { value: '1500.00' } })
      );
    const provider = new YookassaRentalBillingProvider(CFG, fetchImpl as unknown as typeof fetch);

    const parsed = await provider.parsePaidNotification(
      Buffer.from(
        JSON.stringify({
          type: 'notification',
          event: 'payment.succeeded',
          object: { id: 'pay_yk_1' }
        })
      ),
      {}
    );

    expect(parsed).toEqual({ providerInvoiceId: 'pay_yk_1' });
    /* Именно повторный запрос к API — тело уведомления подделать может кто угодно. */
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example.test/v3/payments/pay_yk_1',
      expect.anything()
    );
  });

  it('платёж, который банк не подтвердил, оплатой не считается', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ id: 'pay_yk_1', status: 'pending' }));
    const provider = new YookassaRentalBillingProvider(CFG, fetchImpl as unknown as typeof fetch);

    const parsed = await provider.parsePaidNotification(
      Buffer.from(
        JSON.stringify({
          type: 'notification',
          event: 'payment.succeeded',
          object: { id: 'pay_yk_1' }
        })
      ),
      {}
    );

    expect(parsed).toBeNull();
  });

  it('отмена платежа оплатой не считается', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse({ id: 'pay_yk_1', status: 'canceled' }));
    const provider = new YookassaRentalBillingProvider(CFG, fetchImpl as unknown as typeof fetch);

    const parsed = await provider.parsePaidNotification(
      Buffer.from(
        JSON.stringify({
          type: 'notification',
          event: 'payment.canceled',
          object: { id: 'pay_yk_1' }
        })
      ),
      {}
    );

    expect(parsed).toBeNull();
  });
});
