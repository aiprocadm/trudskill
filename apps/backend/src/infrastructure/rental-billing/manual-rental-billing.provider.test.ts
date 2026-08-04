import { describe, expect, it, vi } from 'vitest';

import {
  ManualRentalBillingProvider,
  formatKopecks,
  renderInvoiceHtml
} from './manual-rental-billing.provider.js';
import { NoopRentalBillingProvider } from './rental-billing.provider.js';

const draft = {
  invoiceId: 'rinv_1',
  tenantId: 't1',
  tenantName: 'УЦ «Пример»',
  number: 'СЧ-42',
  periodStart: '2026-08-01',
  periodEnd: '2026-08-31',
  amountKopecks: 1_500_000,
  currency: 'RUB',
  dueAt: '2026-08-10',
  planName: 'Базовый'
};

describe('manual rental billing provider (ФТ-D5.1)', () => {
  it('копейки печатаются рублями с копейками и разделителем разрядов', () => {
    expect(formatKopecks(1_500_000)).toBe('15 000,00 ₽');
    expect(formatKopecks(5)).toBe('0,05 ₽');
    expect(formatKopecks(123_456)).toBe('1 234,56 ₽');
  });

  it('в счёте есть плательщик, номер, период, срок и сумма; даты — в русском формате', () => {
    const html = renderInvoiceHtml(draft);
    expect(html).toContain('СЧ-42');
    expect(html).toContain('УЦ «Пример»');
    expect(html).toContain('01.08.2026');
    expect(html).toContain('31.08.2026');
    expect(html).toContain('15 000,00 ₽');
    expect(html).toContain('тариф «Базовый»');
  });

  it('данные арендатора экранируются — чужая разметка не ломает счёт', () => {
    const html = renderInvoiceHtml({ ...draft, tenantName: '<script>alert(1)</script>' });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('без тарифа строка счёта остаётся корректной', () => {
    const html = renderInvoiceHtml({ ...draft, planName: undefined });
    expect(html).toContain('Аренда системы дистанционного обучения</td>');
  });

  it('провайдер отдаёт PDF, а при сбое печати — null (счёт уже выставлен)', async () => {
    const ok = new ManualRentalBillingProvider('http://gotenberg:3000', async () =>
      Buffer.from('%PDF-1.4')
    );
    await expect(ok.issue(draft)).resolves.toMatchObject({
      document: { fileName: 'invoice-СЧ-42.pdf', contentType: 'application/pdf' }
    });

    const broken = new ManualRentalBillingProvider(
      'http://gotenberg:3000',
      vi.fn().mockRejectedValue(new Error('gotenberg unreachable'))
    );
    await expect(broken.issue(draft)).resolves.toBeNull();
  });

  it('спящий адаптер ничего не печатает и не падает', async () => {
    await expect(new NoopRentalBillingProvider().issue()).resolves.toBeNull();
  });
});
