import { describe, expect, it } from 'vitest';

import { DocumentsService } from './documents.service.js';
import { InMemoryDocumentsState } from './in-memory-documents.state.js';
import { AuditService } from '../audit/audit.service.js';
import { RealtimeEventsService } from '../core/realtime-events.service.js';

import type { RequestContext } from '../../common/request-context.js';

/**
 * ФТ-A5 «закрыть группу» (Фаза 1 Task 7a).
 *
 * Сценарий УЦ: группа отучилась — одной операцией нужен протокол на группу
 * и удостоверение каждому сдавшему, а если часть рендеров упала (Gotenberg
 * моргнул), повторный запуск обязан добить ТОЛЬКО упавшие, не выпуская дублей
 * и не сжигая номера на уже готовых документах.
 */

const ctx: RequestContext = {
  requestId: 'r1',
  correlationId: 'c1',
  ip: '127.0.0.1',
  userAgent: 'vitest',
  tenantId: 't1',
  userId: 'u1',
  roles: [],
  permissions: [],
  method: 'POST',
  path: '/api/v1/groups/close',
  timestamp: new Date().toISOString()
} as unknown as RequestContext;

const makeService = () => {
  const state = new InMemoryDocumentsState();
  const service = new DocumentsService(state, new AuditService(), new RealtimeEventsService());
  const template = (name: string, templateType: string) => {
    const tpl = service.createTemplate('t1', 'u1', { name, templateType }, ctx);
    const version = service.createTemplateVersion('t1', 'u1', {
      templateId: tpl.id,
      fileId: `file_${name}`
    });
    service.activateTemplateVersion('t1', 'u1', version.id, ctx);
    return tpl.id;
  };
  return {
    state,
    service,
    protocolTemplateId: template('Протокол', 'protocol'),
    certificateTemplateId: template('Удостоверение', 'certificate')
  };
};

const request = (ids: string[], protocolTemplateId: string, certificateTemplateId: string) => ({
  groupId: 'g1',
  protocolTemplateId,
  certificateTemplateId,
  enrollmentIds: ids
});

describe('DocumentsService.closeGroup (ФТ-A5)', () => {
  it('ставит один протокол на группу и по удостоверению каждому сдавшему', () => {
    const { service, protocolTemplateId, certificateTemplateId } = makeService();

    const result = service.closeGroup(
      't1',
      'u1',
      request(['e1', 'e2', 'e3'], protocolTemplateId, certificateTemplateId),
      ctx
    );

    expect(result.protocol.sourceEntityType).toBe('group');
    expect(result.protocol.documentType).toBe('protocol');
    expect(result.certificates).toHaveLength(3);
    expect(result.certificates.map((c) => c.sourceEntityId)).toEqual(['e1', 'e2', 'e3']);
    expect(result.created).toBe(4);
    expect(result.retried).toBe(0);
  });

  it('повторный запуск не плодит задачи — те же самые возвращаются', () => {
    const { service, protocolTemplateId, certificateTemplateId } = makeService();
    const req = request(['e1', 'e2'], protocolTemplateId, certificateTemplateId);

    const first = service.closeGroup('t1', 'u1', req, ctx);
    const second = service.closeGroup('t1', 'u1', req, ctx);

    expect(second.protocol.id).toBe(first.protocol.id);
    expect(second.certificates.map((c) => c.id)).toEqual(first.certificates.map((c) => c.id));
    expect(second.created).toBe(0);
  });

  it('добивает только упавшие: одно удостоверение из трёх перезапускается', () => {
    const { service, protocolTemplateId, certificateTemplateId } = makeService();
    const req = request(['e1', 'e2', 'e3'], protocolTemplateId, certificateTemplateId);
    const first = service.closeGroup('t1', 'u1', req, ctx);
    // Отрабатываем как в жизни: два удостоверения готовы, третье упало на рендере.
    service.completeTask('t1', first.certificates[0]!.id, 'file_ok_1');
    service.completeTask('t1', first.certificates[1]!.id, 'file_ok_2');
    service.startTask('t1', first.certificates[2]!.id);
    service.failTask('t1', first.certificates[2]!.id, 'gotenberg timeout');

    const second = service.closeGroup('t1', 'u1', req, ctx);

    expect(second.retried).toBe(1);
    expect(second.created).toBe(0);
    // Готовые не тронуты, упавшее вернулось в очередь.
    expect(service.getDocumentTask('t1', first.certificates[0]!.id).status).toBe('completed');
    expect(service.getDocumentTask('t1', first.certificates[2]!.id).status).toBe('queued');
  });

  it('дозаказывает удостоверения для добавленных слушателей, не трогая прежние', () => {
    const { service, protocolTemplateId, certificateTemplateId } = makeService();
    const first = service.closeGroup(
      't1',
      'u1',
      request(['e1'], protocolTemplateId, certificateTemplateId),
      ctx
    );

    const second = service.closeGroup(
      't1',
      'u1',
      request(['e1', 'e2'], protocolTemplateId, certificateTemplateId),
      ctx
    );

    expect(second.created).toBe(1);
    expect(second.certificates).toHaveLength(2);
    expect(second.certificates[0]!.id).toBe(first.certificates[0]!.id);
  });

  it('отдаёт сводку статусов — админ видит, на чём стоит группа', () => {
    const { service, protocolTemplateId, certificateTemplateId } = makeService();
    const req = request(['e1', 'e2', 'e3'], protocolTemplateId, certificateTemplateId);
    const first = service.closeGroup('t1', 'u1', req, ctx);
    service.completeTask('t1', first.certificates[0]!.id, 'file_ok');
    service.startTask('t1', first.certificates[1]!.id);
    service.failTask('t1', first.certificates[1]!.id, 'boom');

    const summary = service.getGroupClosureStatus('t1', 'g1');

    expect(summary.total).toBe(4);
    expect(summary.completed).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.queued).toBe(2);
    expect(summary.isComplete).toBe(false);
  });

  it('считает группу закрытой, когда готовы все документы', () => {
    const { service, protocolTemplateId, certificateTemplateId } = makeService();
    const first = service.closeGroup(
      't1',
      'u1',
      request(['e1'], protocolTemplateId, certificateTemplateId),
      ctx
    );
    service.completeTask('t1', first.protocol.id, 'file_protocol');
    service.completeTask('t1', first.certificates[0]!.id, 'file_cert');

    const summary = service.getGroupClosureStatus('t1', 'g1');

    expect(summary.isComplete).toBe(true);
    expect(summary.failed).toBe(0);
  });

  it('отклоняет шаблон неверного типа — протокол не должен рендериться по бланку приказа', () => {
    const { service, certificateTemplateId } = makeService();
    const orderTpl = service.createTemplate(
      't1',
      'u1',
      { name: 'Приказ', templateType: 'order' },
      ctx
    );

    expect(() =>
      service.closeGroup('t1', 'u1', request(['e1'], orderTpl.id, certificateTemplateId), ctx)
    ).toThrow(/protocol/i);
  });

  it('не закрывает группу без сдавших — пустой список это ошибка оператора', () => {
    const { service, protocolTemplateId, certificateTemplateId } = makeService();

    expect(() =>
      service.closeGroup('t1', 'u1', request([], protocolTemplateId, certificateTemplateId), ctx)
    ).toThrow();
  });

  it('сводка переживает очистку идемпотентного кэша', () => {
    const { state, service, protocolTemplateId, certificateTemplateId } = makeService();
    service.closeGroup(
      't1',
      'u1',
      request(['e1', 'e2'], protocolTemplateId, certificateTemplateId),
      ctx
    );

    // Кэш идемпотентности живёт сутки и вычищается по TTL — статус группы
    // обязан считаться по самим задачам, а не по нему.
    state.idem.clear();

    expect(service.getGroupClosureStatus('t1', 'g1').total).toBe(3);
  });

  it('не смешивает группы разных тенантов', () => {
    const { service, protocolTemplateId, certificateTemplateId } = makeService();
    service.closeGroup('t1', 'u1', request(['e1'], protocolTemplateId, certificateTemplateId), ctx);

    expect(service.getGroupClosureStatus('t2', 'g1').total).toBe(0);
  });
});
