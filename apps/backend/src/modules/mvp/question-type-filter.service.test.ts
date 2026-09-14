import { EventEmitter2 } from '@nestjs/event-emitter';
import { describe, expect, it } from 'vitest';

import { InMemoryMvpState } from './infrastructure/in-memory-mvp.state.js';
import { MvpService } from './mvp.service.js';
import { TenantScopedRepository } from '../../infrastructure/database/tenant-repository.js';
import { AuditService } from '../audit/audit.service.js';

import type { RequestContext } from '../../common/context/request-context.js';
import type { DocumentsService } from '../documents/documents.service.js';
import type { FilesService } from '../files/files.service.js';

/**
 * Отбор вопросов банка по типу делает сервер (журнал 390).
 *
 * Два экрана дают человеку выбрать тип вопроса — карточка банка и подбор вопросов в тест.
 * Отбор уходил в адрес запроса, сервер его не читал и отдавал ВСЕ вопросы банка. Проверено
 * живьём на стенде до починки: `?type=несуществующий` возвращал все три вопроса. Человек
 * выбирал «Один из списка», получал вперемешку всё и не понимал, работает отбор или нет.
 */

const noopDocumentsService = {
  listDocuments: () => ({ items: [], page: 1, pageSize: 50, total: 0 })
} as unknown as DocumentsService;

const noopFilesService = {
  ensureMaterialLink: async () => undefined
} as unknown as FilesService;

const T = 'tenant_demo';
const ADMIN = 'u_tenant_admin';

const ctx: RequestContext = {
  requestId: 'req_qtype',
  correlationId: 'corr_qtype',
  tenantId: T,
  userId: ADMIN,
  ip: '127.0.0.1',
  userAgent: 'vitest'
};

const seedBankWithTwoTypes = () => {
  const service = new MvpService(
    new InMemoryMvpState(),
    new TenantScopedRepository(),
    new AuditService(),
    noopDocumentsService,
    noopFilesService,
    new EventEmitter2()
  );
  const course = service.createCourse(T, ADMIN, { code: 'C1', title: 'Курс' }, ctx);
  const bank = service.createQuestionBank(T, ADMIN, { title: 'Банк', courseId: course.id }, ctx);
  service.createQuestion(
    T,
    ADMIN,
    { questionBankId: bank.id, type: 'single_choice', title: 'Один из списка', score: 1 },
    ctx
  );
  service.createQuestion(
    T,
    ADMIN,
    { questionBankId: bank.id, type: 'single_choice', title: 'Ещё один из списка', score: 1 },
    ctx
  );
  service.createQuestion(
    T,
    ADMIN,
    { questionBankId: bank.id, type: 'text', title: 'Свободный ответ', score: 1 },
    ctx
  );
  return { service, bankId: bank.id };
};

describe('вопросы банка отбираются по типу', () => {
  it('без отбора приходят все три вопроса', () => {
    const { service, bankId } = seedBankWithTwoTypes();
    expect(service.listQuestionBankQuestions(T, bankId, {}).total).toBe(3);
  });

  it('с отбором приходят только вопросы этого типа', () => {
    const { service, bankId } = seedBankWithTwoTypes();
    const onlyText = service.listQuestionBankQuestions(T, bankId, { type: 'text' });
    expect(onlyText.total).toBe(1);
    expect(onlyText.items[0]?.title).toBe('Свободный ответ');
  });

  it('несуществующий тип не возвращает ничего — а не всё подряд', () => {
    const { service, bankId } = seedBankWithTwoTypes();
    expect(service.listQuestionBankQuestions(T, bankId, { type: 'такого-нет' }).total).toBe(0);
  });
});
