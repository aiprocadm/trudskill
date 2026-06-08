import { describe, expect, it } from 'vitest';

import { TenantSerialGateway } from './tenant-serial.gateway.js';

/** Resolves after the next macrotask, letting other queued microtasks/chains progress. */
function tick(ms = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('TenantSerialGateway', () => {
  it(
    'allows reentrant nested runExclusive for the same tenant (no deadlock)',
    { timeout: 2000 },
    async () => {
      const gw = new TenantSerialGateway();
      const result = await gw.runExclusive('t1', async () => {
        const inner = await gw.runExclusive('t1', async () => 'inner');
        return `outer:${inner}`;
      });
      expect(result).toBe('outer:inner');
    }
  );

  it(
    'serializes sequential (non-nested) same-tenant calls — second starts only after first finishes',
    { timeout: 2000 },
    async () => {
      const gw = new TenantSerialGateway();
      const events: string[] = [];

      const first = gw.runExclusive('t1', async () => {
        events.push('first:start');
        await tick(20);
        events.push('first:end');
      });
      // Queue the second top-level call while the first is still running.
      const second = gw.runExclusive('t1', async () => {
        events.push('second:start');
        await tick(0);
        events.push('second:end');
      });

      await Promise.all([first, second]);

      expect(events).toEqual(['first:start', 'first:end', 'second:start', 'second:end']);
    }
  );

  it('does not block different tenants by each other', { timeout: 2000 }, async () => {
    const gw = new TenantSerialGateway();
    const order: string[] = [];

    const slow = gw.runExclusive('t1', async () => {
      await tick(50);
      order.push('t1');
    });
    const quick = gw.runExclusive('t2', async () => {
      order.push('t2');
    });

    // t2 must finish before t1 even though t1 was started first.
    await quick;
    expect(order).toEqual(['t2']);

    await slow;
    expect(order).toEqual(['t2', 't1']);
  });

  it(
    'propagates an error from fn and does not poison the tenant chain',
    { timeout: 2000 },
    async () => {
      const gw = new TenantSerialGateway();

      await expect(
        gw.runExclusive('t1', async () => {
          throw new Error('boom');
        })
      ).rejects.toThrow('boom');

      // A subsequent call on the same tenant still runs and resolves.
      const ok = await gw.runExclusive('t1', async () => 'ok');
      expect(ok).toBe('ok');
    }
  );

  it(
    'serializes a nested DIFFERENT tenant correctly (t2 is not held → queues + completes)',
    { timeout: 2000 },
    async () => {
      const gw = new TenantSerialGateway();

      const result = await gw.runExclusive('t1', async () => {
        const inner = await gw.runExclusive('t2', async () => 'inner-t2');
        return `t1:${inner}`;
      });

      expect(result).toBe('t1:inner-t2');
    }
  );
});
