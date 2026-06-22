import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type {
  createOrder as CreateOrder,
  getPaymentProviderSettings as GetPaymentProviderSettings,
  listOrders as ListOrders,
  markOrderPaid as MarkOrderPaid,
  savePaymentProviderSettings as SavePaymentProviderSettings
} from './api';

const fetchMock = vi.fn();

const envelope = <T>(data: T) =>
  JSON.stringify({
    data,
    meta: { requestId: 'r', correlationId: 'c', timestamp: 't' }
  });

describe('payments api', () => {
  let listOrders: typeof ListOrders;
  let createOrder: typeof CreateOrder;
  let markOrderPaid: typeof MarkOrderPaid;
  let getPaymentProviderSettings: typeof GetPaymentProviderSettings;
  let savePaymentProviderSettings: typeof SavePaymentProviderSettings;

  beforeAll(async () => {
    process.env.NEXT_PUBLIC_API_BASE_URL ??= 'http://localhost:3001/api/v1';
    process.env.NEXT_PUBLIC_REALTIME_URL ??= 'ws://localhost:3002';
    process.env.PUBLIC_BASE_URL ??= 'http://localhost:3000';
    const mod = await import('./api');
    listOrders = mod.listOrders;
    createOrder = mod.createOrder;
    markOrderPaid = mod.markOrderPaid;
    getPaymentProviderSettings = mod.getPaymentProviderSettings;
    savePaymentProviderSettings = mod.savePaymentProviderSettings;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it('listOrders unwraps the envelope to an array', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        envelope([{ id: 'o1', status: 'awaiting_payment', totalAmount: 150000, items: [] }]),
        { status: 200 }
      )
    );
    vi.stubGlobal('fetch', fetchMock);
    const orders = await listOrders();
    expect(orders[0]?.id).toBe('o1');
  });

  it('createOrder posts items and returns the created order', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        envelope({ id: 'o2', status: 'awaiting_payment', totalAmount: 100, items: [] }),
        { status: 200 }
      )
    );
    vi.stubGlobal('fetch', fetchMock);
    const order = await createOrder({
      buyerType: 'learner',
      buyerId: 'l1',
      items: [{ groupId: 'g1', learnerId: 'l1', unitAmount: 100 }]
    });
    expect(order.id).toBe('o2');
  });

  it('markOrderPaid hits the mark-paid endpoint', async () => {
    const spy = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            data: { id: 'o1', status: 'paid', items: [] },
            meta: { requestId: 'r', correlationId: 'c', timestamp: 't' }
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
    );
    vi.stubGlobal('fetch', spy);
    await markOrderPaid('o1', { method: 'bank_transfer' });
    const [calledUrl] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(calledUrl).toContain('/orders/o1/mark-paid');
  });

  it('getPaymentProviderSettings unwraps envelope to settings object', async () => {
    const mockSettings = {
      tenantId: 't1',
      providerCode: 'yookassa',
      enabled: true,
      updatedAt: '2026-06-23T00:00:00.000Z'
    };
    fetchMock.mockResolvedValueOnce(new Response(envelope(mockSettings), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await getPaymentProviderSettings();
    expect(result.providerCode).toBe('yookassa');
    expect(result.enabled).toBe(true);
  });

  it('savePaymentProviderSettings sends PUT and returns updated settings', async () => {
    const mockSettings = {
      tenantId: 't1',
      providerCode: 'tinkoff',
      enabled: false,
      updatedAt: '2026-06-23T00:00:00.000Z'
    };
    const spy = vi.fn(async () => new Response(envelope(mockSettings), { status: 200 }));
    vi.stubGlobal('fetch', spy);
    const result = await savePaymentProviderSettings({ providerCode: 'tinkoff', enabled: false });
    const [calledUrl, calledInit] = spy.mock.calls[0] as unknown as [string, RequestInit];
    expect(calledUrl).toContain('/payments/provider-settings');
    expect(calledInit.method).toBe('PUT');
    expect(result.providerCode).toBe('tinkoff');
  });
});
