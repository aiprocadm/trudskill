import { describe, expect, it } from 'vitest';

import { assertOrderTransition, canCancelOrder } from './payments.state-machine.js';

describe('order state machine', () => {
  it('allows awaiting_payment → paid → fulfilled', () => {
    expect(() => assertOrderTransition('awaiting_payment', 'paid')).not.toThrow();
    expect(() => assertOrderTransition('paid', 'fulfilled')).not.toThrow();
  });
  it('forbids fulfilled → paid (no backward)', () => {
    expect(() => assertOrderTransition('fulfilled', 'paid')).toThrow(/invalid_order_transition/);
  });
  it('forbids paying a cancelled order', () => {
    expect(() => assertOrderTransition('cancelled', 'paid')).toThrow(/invalid_order_transition/);
  });
  it('allows cancel only from draft/awaiting_payment', () => {
    expect(canCancelOrder('draft')).toBe(true);
    expect(canCancelOrder('awaiting_payment')).toBe(true);
    expect(canCancelOrder('paid')).toBe(false);
    expect(canCancelOrder('fulfilled')).toBe(false);
  });
});
