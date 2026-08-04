import { describe, expect, it } from 'vitest';

import {
  INVOICE_STATUS_LABELS,
  formatIsoDate,
  formatKopecks,
  isOverdue,
  parseRublesToKopecks
} from './invoices';

import type { RentalInvoiceDto } from './api';

const invoice = (overrides: Partial<RentalInvoiceDto> = {}): RentalInvoiceDto => ({
  id: 'rinv_1',
  tenantId: 't1',
  number: 'СЧ-1',
  periodStart: '2026-08-01',
  periodEnd: '2026-08-31',
  amountKopecks: 1_500_000,
  currency: 'RUB',
  status: 'issued',
  dueAt: '2026-08-10',
  paidAt: null,
  ...overrides
});

describe('rental invoices helpers (ФТ-D5.1)', () => {
  it('копейки печатаются как на сервере: разряды обычным пробелом, копейки через запятую', () => {
    expect(formatKopecks(1_500_000)).toBe('15 000,00 ₽');
    expect(formatKopecks(5)).toBe('0,05 ₽');
    expect(formatKopecks(123_456)).toBe('1 234,56 ₽');
  });

  it('рубли из формы разбираются с запятой, точкой и пробелами', () => {
    expect(parseRublesToKopecks('15000')).toBe(1_500_000);
    expect(parseRublesToKopecks('15 000,50')).toBe(1_500_050);
    expect(parseRublesToKopecks('15000.5')).toBe(1_500_050);
  });

  it('мусор в сумме — null, а не молчаливый ноль', () => {
    expect(parseRublesToKopecks('пятнадцать тысяч')).toBeNull();
    expect(parseRublesToKopecks('')).toBeNull();
    expect(parseRublesToKopecks('-100')).toBeNull();
    expect(parseRublesToKopecks('10,555')).toBeNull();
  });

  it('просрочка подсвечивается только у неоплаченных', () => {
    expect(isOverdue(invoice(), '2026-08-11')).toBe(true);
    expect(isOverdue(invoice(), '2026-08-10')).toBe(false);
    expect(isOverdue(invoice({ status: 'paid' }), '2026-09-01')).toBe(false);
    expect(isOverdue(invoice({ status: 'cancelled' }), '2026-09-01')).toBe(false);
  });

  it('даты в русском формате, у каждого статуса есть подпись', () => {
    expect(formatIsoDate('2026-08-04')).toBe('04.08.2026');
    expect(Object.keys(INVOICE_STATUS_LABELS).sort()).toEqual(['cancelled', 'issued', 'paid']);
  });
});
