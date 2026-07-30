import { describe, expect, it } from 'vitest';

import { EsignController } from './esign.controller.js';

import type { EsignService } from './esign.service.js';
import type { RequestContext } from '../../common/context/request-context.js';

/**
 * Делегирование esign-контроллера (покрытие 0% → полное).
 *
 * Все 33 ручки — тонкая переадресация в сервис. Единственное, что контроллер обязан
 * сделать сам, — передать ТЕНАНТ АКТОРА первым аргументом. Ручка, забывшая
 * `c.tenantId`, отдала бы данные без изоляции; этот тест перебирает прототип целиком,
 * поэтому новая ручка попадает под проверку автоматически.
 */
const ctx = {
  tenantId: 'tenant_demo',
  userId: 'u_1',
  requestId: 'r1',
  correlationId: 'c1'
} as RequestContext;

function recordingService() {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const service = new Proxy(
    {},
    {
      get: (_t, prop: string) => {
        return (...args: unknown[]) => {
          calls.push({ method: prop, args });
          return { delegated: prop };
        };
      }
    }
  ) as unknown as EsignService;
  return { service, calls };
}

const handlerNames = Object.getOwnPropertyNames(EsignController.prototype).filter(
  (n) => n !== 'constructor'
);

describe('EsignController — делегирование под тенантом актора', () => {
  it('в контроллере есть ручки', () => {
    expect(handlerNames.length).toBeGreaterThanOrEqual(30);
  });

  for (const name of handlerNames) {
    it(`${name}: ровно один вызов сервиса, первый аргумент — tenant актора`, () => {
      const { service, calls } = recordingService();
      const controller = new EsignController(service);
      const handler = (controller as unknown as Record<string, (...a: unknown[]) => unknown>)[
        name
      ]!;

      const result = handler.call(controller, ctx, 'arg1', 'arg2', 'arg3');

      expect(calls).toHaveLength(1);
      expect(calls[0]!.args[0]).toBe('tenant_demo');
      // Ответ сервиса возвращается как есть — контроллер ничего не переупаковывает.
      expect(result).toEqual({ delegated: calls[0]!.method });
    });
  }
});
