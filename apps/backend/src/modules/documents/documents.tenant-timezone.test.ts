import { describe, expect, it, vi } from 'vitest';

import { DocumentsService } from './documents.service.js';
import { InMemoryDocumentsState } from './in-memory-documents.state.js';
import { AuditService } from '../audit/audit.service.js';
import { RealtimeEventsService } from '../core/realtime-events.service.js';

import type { RequestContext } from '../../common/context/request-context.js';

/**
 * Дата документа и период его номера считаются в часовом поясе ЦЕНТРА (журнал 300).
 *
 * Проверяется случай, ради которого класс заведён: центр в Новосибирске (UTC+7) закрывает
 * группу 1 января в 06:00 по местному времени. По UTC это ещё 31 декабря прошлого года —
 * и удостоверение получало вчерашнюю дату и номер из ЗАКРЫТОЙ серии. У проверяющего это
 * выглядит как документ, выданный раньше, чем закончилось обучение.
 */

const ctx: RequestContext = {
  requestId: 'r1',
  correlationId: 'c1',
  tenantId: 't1',
  userId: 'u1',
  ip: '127.0.0.1',
  userAgent: 'vitest'
};

/** 2026-12-31T23:00:00Z = 2027-01-01T06:00 в Новосибирске. */
const NEW_YEAR_MORNING = new Date('2026-12-31T23:00:00.000Z');

function issueDocument(timezone: string | undefined) {
  const state = new InMemoryDocumentsState();
  state.tenantTimezone = timezone;
  const service = new DocumentsService(state, new AuditService(), new RealtimeEventsService());

  service.createNumberingRule('t1', {
    documentType: 'certificate',
    prefix: 'CERT-',
    resetPeriod: 'year'
  });
  const template = service.createTemplate(
    't1',
    'u1',
    { name: 'Удостоверение', templateType: 'certificate' },
    ctx
  );
  const version = service.createTemplateVersion('t1', 'u1', {
    templateId: template.id,
    fileId: 'file_1'
  });
  service.activateTemplateVersion('t1', 'u1', version.id, ctx);

  const task = service.generateDocument('t1', 'u1', {
    idempotencyKey: 'idem-1',
    templateId: template.id,
    sourceEntityType: 'enrollment',
    sourceEntityId: 'enr_1',
    documentType: 'certificate'
  });
  service.startTask('t1', task.id);
  return service.completeTask('t1', task.id, 'file_result');
}

describe('дата документа и номер — в часовом поясе центра (журнал 300)', () => {
  it('Новосибирск: удостоверение новогоднего утра датировано 1 января и в новой серии', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(NEW_YEAR_MORNING);
      const document = issueDocument('Asia/Novosibirsk');

      expect(document.documentDate).toBe('2027-01-01');
      expect(document.documentNumber).toContain('2027');
    } finally {
      vi.useRealTimers();
    }
  });

  it('тот же момент по UTC дал бы вчерашнюю дату и закрытую серию', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(NEW_YEAR_MORNING);
      const document = issueDocument('UTC');

      // Это ровно прежнее поведение — оставлено проверкой, чтобы разница была видна глазом.
      expect(document.documentDate).toBe('2026-12-31');
      expect(document.documentNumber).toContain('2026');
    } finally {
      vi.useRealTimers();
    }
  });

  it('центр без настройки пояса считается по Москве, а не по UTC', () => {
    vi.useFakeTimers();
    try {
      // 2026-06-30T22:30:00Z = 2026-07-01T01:30 в Москве.
      vi.setSystemTime(new Date('2026-06-30T22:30:00.000Z'));
      const document = issueDocument(undefined);

      expect(document.documentDate).toBe('2026-07-01');
    } finally {
      vi.useRealTimers();
    }
  });
});
