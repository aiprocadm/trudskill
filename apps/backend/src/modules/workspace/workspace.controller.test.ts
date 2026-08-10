import { describe, expect, it } from 'vitest';

import { WorkspaceController } from './workspace.controller.js';

import type { RequestContext } from '../../common/context/request-context.js';

/**
 * Рабочий стол отдаёт СПИСКИ, а не обещания (найдено на живом стенде 2026-08-10).
 *
 * ЗАЧЕМ ЭТОТ ТЕСТ. Это первый экран администратора после входа. Обработчики клали
 * результат асинхронного метода внутрь объекта БЕЗ `await`:
 *
 *     return { items: this.workspaceService.getTasksInbox(...) };   // <- Promise!
 *
 * Nest разворачивает обещание, только если его ВЕРНУЛИ из обработчика. Внутри объекта оно
 * так и уезжает в JSON и превращается там в пустой `{}`. Экран получал объект вместо
 * списка и падал: «filter is not a function». Ни один тест этого не ловил, потому что сам
 * сервис работал правильно — ломалась только упаковка ответа.
 */
const CTX = { tenantId: 'tenant_demo' } as RequestContext;

const makeController = () => {
  const service = {
    getWorkspaceSummary: async () => ({ overdueCount: 0, blockersCount: 0, nextActions: [] }),
    getTasksInbox: async () => [{ id: 't1', title: 'Задача', status: 'overdue', route: '/x' }],
    getBlockers: async () => [{ id: 'b1', title: 'Помеха' }]
  };
  return new WorkspaceController(service as never);
};

describe('рабочий стол отдаёт настоящие списки', () => {
  it('входящие задачи — массив, а не обещание', async () => {
    const result = await makeController().getTasksInbox(CTX);

    expect(Array.isArray(result.items), 'items должен быть массивом').toBe(true);
    expect(result.items).toHaveLength(1);
  });

  it('помехи — массив, а не обещание', async () => {
    const result = await makeController().getBlockers(CTX);

    expect(Array.isArray(result.items), 'items должен быть массивом').toBe(true);
    expect(result.items).toHaveLength(1);
  });

  it('после сериализации в JSON списки остаются списками', async () => {
    // Именно этот шаг и ломался: необёрнутое обещание превращается в JSON в пустой объект.
    const controller = makeController();
    const payload = JSON.parse(
      JSON.stringify({
        inbox: await controller.getTasksInbox(CTX),
        blockers: await controller.getBlockers(CTX)
      })
    ) as { inbox: { items: unknown }; blockers: { items: unknown } };

    expect(Array.isArray(payload.inbox.items)).toBe(true);
    expect(Array.isArray(payload.blockers.items)).toBe(true);
  });
});
