import 'reflect-metadata';

import { describe, expect, it, vi } from 'vitest';

import { DocumentsController } from './documents.controller.js';
import { MvpController } from '../mvp/mvp.controller.js';

import type { RequestContext } from '../../common/context/request-context.js';

const ctx = {
  requestId: 'req_1',
  correlationId: 'corr_1',
  tenantId: 'tenant_demo',
  userId: 'u_admin'
} as RequestContext;

const result = {
  protocol: { id: 'task_protocol', status: 'queued' },
  certificates: [
    { id: 'task_cert_1', status: 'queued' },
    { id: 'task_cert_2', status: 'completed' }
  ],
  created: 2,
  retried: 0
};

/**
 * Журнал 662: задачи «Закрыть группу» создавались, но в очередь не отправлялись. Рабочий выпуск
 * берёт задачи только из очереди — протокол и удостоверения стояли «в очереди» навсегда, пока
 * кто-то не нажимал «Повторить» по каждой. Оба входа закрытия группы обязаны публиковать задачи.
 */
describe('закрытие группы отправляет задачи выпуска в очередь (журнал 662)', () => {
  it('POST admin/documents/close-group', async () => {
    const publishQueuedTasks = vi.fn().mockResolvedValue(undefined);
    const self = {
      documentsService: { closeGroup: vi.fn().mockReturnValue(result) },
      enqueue: { publishQueuedTasks }
    };
    await DocumentsController.prototype.closeGroup.call(self as never, ctx, {
      groupId: 'g1',
      protocolTemplateId: 'tpl_p',
      certificateTemplateId: 'tpl_c',
      enrollmentIds: ['e1', 'e2']
    });
    expect(publishQueuedTasks).toHaveBeenCalledWith(
      'tenant_demo',
      [result.protocol, ...result.certificates],
      { requestId: 'req_1', correlationId: 'corr_1' }
    );
  });

  it('POST groups/:groupId/close (с проверками готовности)', async () => {
    const publishQueuedTasks = vi.fn().mockResolvedValue(undefined);
    const self = {
      mvpService: { closeGroupWithChecks: vi.fn().mockReturnValue(result) },
      documentsEnqueue: { publishQueuedTasks }
    };
    await MvpController.prototype.closeGroupWithChecks.call(self as never, ctx, 'g1', {
      courseId: 'c1',
      protocolTemplateId: 'tpl_p',
      certificateTemplateId: 'tpl_c',
      enrollmentIds: ['e1', 'e2']
    });
    expect(publishQueuedTasks).toHaveBeenCalledWith(
      'tenant_demo',
      [result.protocol, ...result.certificates],
      { requestId: 'req_1', correlationId: 'corr_1' }
    );
  });
});
