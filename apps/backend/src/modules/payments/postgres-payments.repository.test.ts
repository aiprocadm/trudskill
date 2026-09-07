import { describe, expect, it } from 'vitest';

import { PostgresPaymentsRepository } from './postgres-payments.repository.js';

import type { DatabaseService } from '../../infrastructure/database/database.service.js';

/**
 * Маппинг строк БД → доменные сущности (покрытие 0% → полное).
 *
 * Репозиторий не проверялся вовсе: опечатка в имени колонки или забытый
 * `Number(bigint)` дошли бы до прода молча. Поддельная база отвечает по фрагменту SQL
 * и записывает вызовы — так проверяются и параметры (tenant_id обязан быть в where),
 * и перевод snake_case → camelCase, и bigint-строки в числа.
 */
type Call = { sql: string; params: unknown[] };

function fakeDb(routes: Array<{ match: string; rows: unknown[] }>, fail?: (sql: string) => void) {
  const calls: Call[] = [];
  /*
   * §5.429: заказ пишется под транзакцией, поэтому подделка обязана уметь то же, что настоящая
   * база, — выдать клиента и откатить всё, если внутри бросили. Иначе тест проверял бы не то,
   * что работает в бою.
   */
  const query = async (sql: string, params: unknown[] = []) => {
    fail?.(sql);
    calls.push({ sql, params });
    const route = routes.find((r) => sql.includes(r.match));
    return route ? route.rows : [];
  };
  const db = {
    query,
    withTransaction: async <T>(fn: (client: { query: typeof query }) => Promise<T>) => {
      const before = calls.length;
      try {
        return await fn({ query });
      } catch (error) {
        // Откат: записи, сделанные внутри неудавшейся транзакции, до базы не доехали.
        calls.splice(before);
        throw error;
      }
    }
  } as unknown as DatabaseService;
  return { db, calls };
}

const orderRow = {
  id: 'ord_1',
  tenant_id: 't1',
  buyer_type: 'learner',
  buyer_id: 'l1',
  status: 'awaiting_payment',
  currency: 'RUB',
  total_amount: '150000', // pg отдаёт bigint строкой
  description: null,
  created_by: 'u1',
  created_at: 'c',
  updated_at: 'u'
};
const itemRow = {
  id: 'oi_1',
  tenant_id: 't1',
  order_id: 'ord_1',
  group_id: 'g1',
  learner_id: 'l1',
  unit_amount: '150000',
  fulfillment_status: 'pending',
  enrollment_id: null,
  created_at: 'c',
  updated_at: 'u'
};
const paymentRow = {
  id: 'pay_1',
  tenant_id: 't1',
  order_id: 'ord_1',
  provider: 'yookassa',
  provider_payment_id: 'yk_1',
  method: 'card',
  status: 'pending',
  amount: '150000',
  confirmation_url: null,
  paid_at: null,
  idempotency_key: 'k1',
  raw_payload: { a: 1 },
  created_at: 'c',
  updated_at: 'u'
};

describe('PostgresPaymentsRepository — маппинг и параметры', () => {
  it('getOrder: bigint-строка становится числом, null-поля не попадают в сущность', async () => {
    const { db, calls } = fakeDb([
      { match: 'from payments.orders', rows: [orderRow] },
      { match: 'from payments.order_items', rows: [itemRow] }
    ]);
    const repo = new PostgresPaymentsRepository(db);

    const order = await repo.getOrder('t1', 'ord_1');

    expect(order).toMatchObject({
      id: 'ord_1',
      tenantId: 't1',
      totalAmount: 150000,
      createdBy: 'u1'
    });
    expect(order).not.toHaveProperty('description');
    expect(order!.items[0]).toMatchObject({ unitAmount: 150000 });
    expect(order!.items[0]).not.toHaveProperty('enrollmentId');
    // Изоляция: заказ ищется строго в паре с tenant_id.
    expect(calls[0]!.params).toEqual(['t1', 'ord_1']);
  });

  it('getOrder: нет строки — null, а не исключение', async () => {
    const { db } = fakeDb([]);
    await expect(new PostgresPaymentsRepository(db).getOrder('t1', 'x')).resolves.toBeNull();
  });

  it('createOrder: сумма заказа складывается из позиций, каждая позиция — отдельная вставка', async () => {
    const { db, calls } = fakeDb([
      { match: 'from payments.orders', rows: [orderRow] },
      { match: 'from payments.order_items', rows: [itemRow] }
    ]);
    await new PostgresPaymentsRepository(db).createOrder({
      tenantId: 't1',
      buyerType: 'learner',
      buyerId: 'l1',
      currency: 'RUB',
      items: [
        { groupId: 'g1', learnerId: 'l1', unitAmount: 100 },
        { groupId: 'g1', learnerId: 'l2', unitAmount: 50 }
      ]
    } as never);

    const orderInsert = calls.find((c) => c.sql.includes('insert into payments.orders'))!;
    expect(orderInsert.params).toContain(150); // 100 + 50
    const itemInserts = calls.filter((c) => c.sql.includes('insert into payments.order_items'));
    expect(itemInserts).toHaveLength(2);
  });

  it('listOrders: фильтры добавляются в where по мере наличия', async () => {
    const { db, calls } = fakeDb([{ match: 'from payments.orders', rows: [] }]);
    await new PostgresPaymentsRepository(db).listOrders('t1', {
      status: 'paid',
      buyerId: 'l1'
    });

    expect(calls[0]!.sql).toContain('o.status = $2');
    expect(calls[0]!.sql).toContain('o.buyer_id = $3');
    expect(calls[0]!.params).toEqual(['t1', 'paid', 'l1']);
  });

  it('createPayment: конфликт идемпотентности возвращает СУЩЕСТВУЮЩИЙ платёж', async () => {
    // insert … do nothing вернул пусто → повторный create не задваивает выручку.
    const { db } = fakeDb([
      { match: 'insert into payments.payments', rows: [] },
      { match: 'select * from payments.payments where tenant_id', rows: [paymentRow] }
    ]);
    const payment = await new PostgresPaymentsRepository(db).createPayment({
      tenantId: 't1',
      orderId: 'ord_1',
      provider: 'yookassa',
      method: 'card',
      status: 'pending',
      amount: 150000,
      idempotencyKey: 'k1'
    } as never);

    expect(payment.id).toBe('pay_1');
    expect(payment.amount).toBe(150000);
    expect(payment.idempotencyKey).toBe('k1');
  });

  it('findOrderByProviderPaymentId: провайдер сужает поиск, отсутствие — null', async () => {
    const { db, calls } = fakeDb([
      { match: 'from payments.payments', rows: [paymentRow] },
      { match: 'from payments.orders', rows: [orderRow] },
      { match: 'from payments.order_items', rows: [itemRow] }
    ]);
    const found = await new PostgresPaymentsRepository(db).findOrderByProviderPaymentId(
      'yk_1',
      'yookassa'
    );

    expect(found).toMatchObject({ tenantId: 't1' });
    expect(calls[0]!.sql).toContain('provider = $2');

    const { db: empty } = fakeDb([]);
    await expect(
      new PostgresPaymentsRepository(empty).findOrderByProviderPaymentId('nope')
    ).resolves.toBeNull();
  });

  it('updatePaymentStatus / updateOrderStatus / markItemFulfilled: tenant_id в where', async () => {
    const { db, calls } = fakeDb([]);
    const repo = new PostgresPaymentsRepository(db);
    await repo.updatePaymentStatus('t1', 'pay_1', 'succeeded', '2026-01-01');
    await repo.updateOrderStatus('t1', 'ord_1', 'paid');
    await repo.markItemFulfilled('t1', 'oi_1', 'enrolled', 'enr_1');

    for (const call of calls) {
      expect(call.sql).toContain('tenant_id = $1');
      expect(call.params[0]).toBe('t1');
    }
  });
  /*
   * §5.429. Заказ и его товары — одно событие. Порознь между строкой заказа и строками товаров
   * умещается падение, и остаётся заказ с полной суммой, но неполным составом: человек
   * оплачивает его целиком, а зачислений получает меньше, чем купил. По записям это выглядит
   * законным заказом, а не сбоем, — разбирать пришлось бы вручную, сверяя с платежом.
   */
  it('падение на товаре не оставляет заказ без товаров', async () => {
    let seen = 0;
    const { db, calls } = fakeDb([], (sql) => {
      if (!/insert into payments\.order_items/i.test(sql)) return;
      seen += 1;
      if (seen === 2) throw new Error('обрыв соединения на втором товаре');
    });
    const repo = new PostgresPaymentsRepository(db);

    await expect(
      repo.createOrder({
        tenantId: 't1',
        buyerType: 'learner',
        buyerId: 'u1',
        currency: 'RUB',
        items: [
          { groupId: 'g1', learnerId: 'l1', unitAmount: 100 },
          { groupId: 'g1', learnerId: 'l2', unitAmount: 100 }
        ]
      } as never)
    ).rejects.toThrow('обрыв соединения');

    // Ни строки заказа, ни первого товара: транзакция откатила всё.
    expect(calls.filter((call) => /insert into payments\./i.test(call.sql))).toHaveLength(0);
  });
});
