import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { CreateOrderRequest, MarkPaidRequest } from './payments.dto.js';

const errCount = (cls: any, raw: unknown) =>
  validateSync(plainToInstance(cls, raw), { whitelist: true }).length;

describe('CreateOrderRequest', () => {
  it('accepts a valid one-item order', () => {
    expect(
      errCount(CreateOrderRequest, {
        buyerType: 'learner',
        buyerId: 'l1',
        description: 'Курс ОТ',
        items: [{ groupId: 'g1', learnerId: 'l1', unitAmount: 150000 }]
      })
    ).toBe(0);
  });
  it('rejects an empty items array', () => {
    expect(
      errCount(CreateOrderRequest, { buyerType: 'learner', buyerId: 'l1', items: [] })
    ).toBeGreaterThan(0);
  });
  it('rejects a non-integer / negative unitAmount', () => {
    expect(
      errCount(CreateOrderRequest, {
        buyerType: 'learner',
        buyerId: 'l1',
        items: [{ groupId: 'g1', learnerId: 'l1', unitAmount: -5 }]
      })
    ).toBeGreaterThan(0);
    expect(
      errCount(CreateOrderRequest, {
        buyerType: 'learner',
        buyerId: 'l1',
        items: [{ groupId: 'g1', learnerId: 'l1', unitAmount: 1.5 }]
      })
    ).toBeGreaterThan(0);
  });
  it('rejects an invalid buyerType', () => {
    expect(
      errCount(CreateOrderRequest, {
        buyerType: 'alien',
        buyerId: 'l1',
        items: [{ groupId: 'g1', learnerId: 'l1', unitAmount: 100 }]
      })
    ).toBeGreaterThan(0);
  });
});

describe('MarkPaidRequest', () => {
  it('accepts bank_transfer method', () => {
    expect(errCount(MarkPaidRequest, { method: 'bank_transfer' })).toBe(0);
  });
  it('rejects an unknown method', () => {
    expect(errCount(MarkPaidRequest, { method: 'crypto' })).toBeGreaterThan(0);
  });
});
