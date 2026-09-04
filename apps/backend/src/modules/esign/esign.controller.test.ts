import { describe, expect, it } from 'vitest';

import { EsignController } from './esign.controller.js';
import { REQUIRED_PERMISSIONS } from '../iam/permission.decorator.js';

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

/*
 * Тела запросов для ручек, которые с ревизии 2026-08-26 проверяют вход (§5.360).
 *
 * Раньше сюда шли строки-заглушки `'arg1'`: тела никто не проверял, и любая строка
 * доезжала до сервиса. Теперь проверка отклонит мусор раньше вызова, поэтому перебор
 * подаёт настоящие тела — иначе тест доказывал бы не делегирование, а работу проверки.
 *
 * Ручка без записи здесь получит строку и упадёт — это намеренно: новая ручка с телом
 * должна быть внесена сюда осознанно, а не проехать мимо сторожа изоляции.
 */
const BODIES: Record<string, unknown> = {
  createApplication: { learnerId: 'lrn_1' },
  patchApplication: { expiresAt: '2026-12-31' },
  rejectApplication: { reason: 'паспорт нечитаем' },
  createApplicationFile: { applicationId: 'esa_1', fileId: 'fil_1' },
  rejectApplicationFile: { reason: 'скан не читается' },
  createProcess: { idempotencyKey: 'idem_1', generatedDocumentId: 'doc_1' },
  startProcess: { idempotencyKey: 'idem_1' },
  createParticipant: {
    processId: 'prc_1',
    participantType: 'commission_member',
    participantUserId: 'usr_1',
    signOrder: 1
  },
  patchParticipant: { signOrder: 2 },
  sign: { idempotencyKey: 'sign_1' },
  reject: { idempotencyKey: 'rej_1' },
  skip: { idempotencyKey: 'skip_1' }
};

/** Тело у этих ручек идёт вторым аргументом после контекста, у остальных — третьим. */
const BODY_SECOND = new Set([
  'createApplication',
  'createProcess',
  'createApplicationFile',
  'createParticipant'
]);

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

      const body = BODIES[name];
      const args = body
        ? BODY_SECOND.has(name)
          ? [body, 'arg2', 'arg3']
          : ['arg1', body, 'arg3']
        : ['arg1', 'arg2', 'arg3'];

      const result = handler.call(controller, ctx, ...args);

      expect(calls).toHaveLength(1);
      expect(calls[0]!.args[0]).toBe('tenant_demo');
      // Ответ сервиса возвращается как есть — контроллер ничего не переупаковывает.
      expect(result).toEqual({ delegated: calls[0]!.method });
    });
  }
});

/**
 * Право на `reuse-check` (журнал 340).
 *
 * По имени — проверка, по делу — переход одобренной заявки в `reused` и запись в юридический
 * журнал. Стояло `esign.applications.read`, которое сид 0085 выдаёт менеджеру со словами
 * «менеджер — только смотрит». Ведение заявок в том же сиде — `esign.applications.write`
 * (администрация и методист); его и требует ручка.
 */
describe('EsignController — reuse-check меняет заявку, поэтому требует права вести заявки', () => {
  it('reuseCheck закрыт esign.applications.write, а не read', () => {
    const required = Reflect.getMetadata(
      REQUIRED_PERMISSIONS,
      EsignController.prototype.reuseCheck
    ) as string[] | undefined;
    expect(required).toEqual(['esign.applications.write']);
  });
});
