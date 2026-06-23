import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import { RobokassaProvider, orderToInvId } from './robokassa-payment.provider.js';

const cfg = {
  merchantLogin: 'shop',
  password1: 'p1',
  password2: 'p2',
  payUrl: 'https://auth.robokassa.ru/Merchant/Index.aspx'
};

function md5(s: string) {
  return createHash('md5').update(s).digest('hex');
}

describe('RobokassaProvider.createPayment', () => {
  it('builds a signed redirect URL (no HTTP) with rubles OutSum', async () => {
    const p = new RobokassaProvider(cfg);
    const res = await p.createPayment({
      tenantId: 't1',
      orderId: 'o1',
      amount: 150000,
      currency: 'RUB',
      description: 'Курс'
    });
    const invId = orderToInvId('o1');
    expect(res.status).toBe('pending');
    expect(res.providerPaymentId).toBe(String(invId));
    const url = new URL(res.confirmationUrl!);
    expect(url.searchParams.get('OutSum')).toBe('1500.00');
    expect(url.searchParams.get('InvId')).toBe(String(invId));
    expect(url.searchParams.get('SignatureValue')).toBe(md5(`shop:1500.00:${invId}:p1`));
  });
});

describe('RobokassaProvider.parseWebhook', () => {
  it('verifies the ResultURL md5 and maps to succeeded', async () => {
    const p = new RobokassaProvider(cfg);
    const body = `OutSum=1500.00&InvId=42&SignatureValue=${md5('1500.00:42:p2')}`;
    const ev = await p.parseWebhook(Buffer.from(body), {
      'content-type': 'application/x-www-form-urlencoded'
    });
    expect(ev).toMatchObject({ providerPaymentId: '42', status: 'succeeded' });
    // OutSum 1500.00 rubles → 150000 kopecks for the amount cross-check.
    expect(ev?.amount).toBe(150000);
  });
  it('returns null on a bad signature', async () => {
    const p = new RobokassaProvider(cfg);
    const ev = await p.parseWebhook(Buffer.from('OutSum=1500.00&InvId=42&SignatureValue=bad'), {});
    expect(ev).toBeNull();
  });
  it('acks with OK{InvId}', async () => {
    const p = new RobokassaProvider(cfg);
    const raw = Buffer.from(`OutSum=1500.00&InvId=42&SignatureValue=${md5('1500.00:42:p2')}`);
    const ev = await p.parseWebhook(raw, {});
    expect(p.webhookAck(ev, raw)).toBe('OK42');
  });
});
