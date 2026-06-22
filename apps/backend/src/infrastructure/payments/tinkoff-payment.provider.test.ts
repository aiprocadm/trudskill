// apps/backend/src/infrastructure/payments/tinkoff-payment.provider.test.ts
import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { TinkoffPaymentProvider, tinkoffToken } from './tinkoff-payment.provider.js';

const cfg = {
  terminalKey: 'TERM1',
  password: 'pw',
  apiBase: 'https://securepay.tinkoff.ru',
  successUrl: 'https://lms.example.ru/return'
};

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body)
  } as unknown as Response;
}

describe('tinkoffToken', () => {
  it('hashes sorted root scalar values + password', () => {
    const token = tinkoffToken({ TerminalKey: 'TERM1', Amount: 100, OrderId: 'o1' }, 'pw');
    const expected = createHash('sha256')
      .update('100' + 'o1' + 'pw' + 'TERM1') // Amount, OrderId, Password, TerminalKey sorted by key
      .digest('hex');
    expect(token).toBe(expected);
  });
});

describe('TinkoffPaymentProvider.createPayment', () => {
  it('Init with kopeck Amount + token; returns PaymentURL', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ Success: true, PaymentId: '900', PaymentURL: 'https://pay/t-900' })
      );
    const p = new TinkoffPaymentProvider(cfg, fetchMock as unknown as typeof fetch);
    const res = await p.createPayment({
      tenantId: 't1',
      orderId: 'o1',
      amount: 150000,
      currency: 'RUB',
      description: 'Курс'
    });
    expect(res).toEqual({
      providerPaymentId: '900',
      status: 'pending',
      confirmationUrl: 'https://pay/t-900'
    });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as any).body);
    expect(body.Amount).toBe(150000);
    expect(body.OrderId).toBe('o1');
    expect(typeof body.Token).toBe('string');
  });

  it('throws when Success=false', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ Success: false, Message: 'bad' }));
    const p = new TinkoffPaymentProvider(cfg, fetchMock as unknown as typeof fetch);
    await expect(
      p.createPayment({
        tenantId: 't1',
        orderId: 'o1',
        amount: 1,
        currency: 'RUB',
        description: 'x'
      })
    ).rejects.toThrow();
  });
});

describe('TinkoffPaymentProvider.parseWebhook', () => {
  function notif(extra: Record<string, unknown>) {
    const base = { TerminalKey: 'TERM1', PaymentId: '900', Status: 'CONFIRMED', ...extra };
    const token = tinkoffToken(base, 'pw');
    return Buffer.from(JSON.stringify({ ...base, Token: token }));
  }
  it('verifies the token and maps CONFIRMED → succeeded', async () => {
    const p = new TinkoffPaymentProvider(cfg, vi.fn() as unknown as typeof fetch);
    const ev = await p.parseWebhook(notif({}), {});
    expect(ev).toMatchObject({ providerPaymentId: '900', status: 'succeeded' });
  });
  it('returns null on a bad token', async () => {
    const p = new TinkoffPaymentProvider(cfg, vi.fn() as unknown as typeof fetch);
    const raw = Buffer.from(
      JSON.stringify({
        TerminalKey: 'TERM1',
        PaymentId: '900',
        Status: 'CONFIRMED',
        Token: 'wrong'
      })
    );
    expect(await p.parseWebhook(raw, {})).toBeNull();
  });
  it('returns null when Token is missing entirely', async () => {
    const p = new TinkoffPaymentProvider(cfg, vi.fn() as unknown as typeof fetch);
    const raw = Buffer.from(
      JSON.stringify({ TerminalKey: 'TERM1', PaymentId: '900', Status: 'CONFIRMED' })
    );
    expect(await p.parseWebhook(raw, {})).toBeNull();
  });
  it('returns null when TerminalKey does not match', async () => {
    const p = new TinkoffPaymentProvider(cfg, vi.fn() as unknown as typeof fetch);
    const base = { TerminalKey: 'OTHER', PaymentId: '900', Status: 'CONFIRMED' };
    const token = tinkoffToken(base, 'pw');
    const raw = Buffer.from(JSON.stringify({ ...base, Token: token }));
    expect(await p.parseWebhook(raw, {})).toBeNull();
  });
  it('acks with the literal OK', () => {
    const p = new TinkoffPaymentProvider(cfg, vi.fn() as unknown as typeof fetch);
    expect(p.webhookAck()).toBe('OK');
  });
});
