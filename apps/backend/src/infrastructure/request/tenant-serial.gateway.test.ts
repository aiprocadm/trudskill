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

/*
 * Ревизия 2026-08-27 (порция 26, журнал 271).
 *
 * Реентрантность определяется по AsyncLocalStorage — а его контекст наследуют и
 * ОТСОЕДИНЁННЫЕ ветки: `setImmediate`, обработчики событий, любые фоновые продолжения.
 * Слушатель выдачи документов стартует именно так изнутри критической секции запроса,
 * поэтому считал замок «уже своим» и работал ПАРАЛЛЕЛЬНО с чужой секцией того же
 * арендатора. Сохранение переписывает весь снимок домена целиком, так что победитель
 * затирал свежевыпущенные удостоверения — тихо, с записью «выдано» в журнале.
 */
describe('TenantSerialGateway — замок не утекает в фоновые ветки (порция 26)', () => {
  it(
    'работа, стартовавшая форком изнутри секции, ждёт очереди, а не идёт вперёд',
    { timeout: 2000 },
    async () => {
      const gw = new TenantSerialGateway();
      const order: string[] = [];
      let detached: Promise<unknown> | undefined;

      await gw.runExclusive('t1', async () => {
        order.push('секция:начало');
        // Так стартует слушатель события: отдельной веткой, но из-под секции.
        detached = new Promise((resolve) => {
          setImmediate(() => {
            resolve(
              gw.runDetached(() =>
                gw.runExclusive('t1', async () => {
                  order.push('фоновая работа');
                })
              )
            );
          });
        });
        await tick(30);
        order.push('секция:конец');
      });
      await detached;

      expect(order).toEqual(['секция:начало', 'секция:конец', 'фоновая работа']);
    }
  );

  it(
    'ветка, пережившая секцию, замок не наследует — даже без явного отсоединения',
    { timeout: 2000 },
    async () => {
      const gw = new TenantSerialGateway();
      const order: string[] = [];
      let leaked: Promise<unknown> | undefined;

      await gw.runExclusive('t1', async () => {
        // Ветка запомнит контекст секции, но выполнится уже после её завершения.
        leaked = new Promise((resolve) => {
          setTimeout(() => {
            resolve(
              gw.runExclusive('t1', async () => {
                order.push('поздняя ветка');
              })
            );
          }, 20);
        });
        order.push('секция');
      });

      // Пока поздняя ветка ждёт, занимаем замок надолго: если она сочтёт его «своим»,
      // то влезет внутрь этой секции — порядок это покажет.
      const holder = gw.runExclusive('t1', async () => {
        order.push('вторая секция:начало');
        await tick(60);
        order.push('вторая секция:конец');
      });

      await Promise.all([holder, leaked]);
      expect(order).toEqual([
        'секция',
        'вторая секция:начало',
        'вторая секция:конец',
        'поздняя ветка'
      ]);
    }
  );

  it('честная вложенность по-прежнему не ждёт сама себя', { timeout: 2000 }, async () => {
    const gw = new TenantSerialGateway();
    const result = await gw.runExclusive('t1', async () => {
      const inner = await gw.runExclusive('t1', async () => 'внутри');
      return `снаружи:${inner}`;
    });
    expect(result).toBe('снаружи:внутри');
  });
});
