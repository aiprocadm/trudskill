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
 * Ручное создание слушателя ломало ФИО (срез 44).
 *
 * `POST /learners` разбирал имя наивным `name.split(' ')`: «Иванов Иван Иванович»
 * становился именем «Иванов» и фамилией «Иван», отчество исчезало. Это не косметика —
 * ФИО отсюда попадает в удостоверение и протокол, документы с юридической силой, и
 * человек, заведённый руками, отличался от того же человека, загруженного из Excel.
 *
 * Тест держит оба свойства: правильный разбор и совпадение с массовым импортом.
 */

const ctx: RequestContext = {
  requestId: 'req_1',
  correlationId: 'corr_1',
  tenantId: 'tenant_demo',
  userId: 'u_admin',
  ip: '127.0.0.1',
  userAgent: 'vitest'
};

const noopDocuments = {
  listDocuments: () => ({ items: [], page: 1, pageSize: 50, total: 0 })
} as unknown as DocumentsService;

const noopFiles = { ensureMaterialLink: async () => undefined } as unknown as FilesService;

const makeService = (): MvpService =>
  new MvpService(
    new InMemoryMvpState(),
    new TenantScopedRepository(),
    new AuditService(),
    noopDocuments,
    noopFiles,
    new EventEmitter2()
  );

describe('createLearner · разбор русского ФИО', () => {
  it('«Фамилия Имя Отчество» раскладывается по своим полям', () => {
    const service = makeService();

    const learner = service.createLearner(
      'tenant_demo',
      'u_admin',
      { name: 'Иванов Иван Иванович', code: 'L-1' },
      ctx
    );

    expect(learner.lastName).toBe('Иванов');
    expect(learner.firstName).toBe('Иван');
    expect(learner.middleName).toBe('Иванович');
  });

  it('двойное отчество не теряется', () => {
    const service = makeService();

    const learner = service.createLearner(
      'tenant_demo',
      'u_admin',
      { name: 'Ким Сергей Ли Хван' },
      ctx
    );

    expect(learner.lastName).toBe('Ким');
    expect(learner.firstName).toBe('Сергей');
    expect(learner.middleName).toBe('Ли Хван');
  });

  it('«Фамилия Имя» без отчества — отчество не выдумывается', () => {
    const service = makeService();

    const learner = service.createLearner('tenant_demo', 'u_admin', { name: 'Петров Пётр' }, ctx);

    expect(learner.lastName).toBe('Петров');
    expect(learner.firstName).toBe('Пётр');
    expect(learner.middleName).toBeUndefined();
  });

  it('одно слово считается именем, а не фамилией, и не пропадает', () => {
    const service = makeService();

    const learner = service.createLearner('tenant_demo', 'u_admin', { name: 'Мадонна' }, ctx);

    expect(learner.firstName).toBe('Мадонна');
    expect(learner.lastName).toBe('');
  });

  it('руками и импортом заведённый человек получает одинаковую карточку', async () => {
    const service = makeService();

    const manual = service.createLearner(
      'tenant_demo',
      'u_admin',
      { name: 'Сидорова Анна Петровна' },
      ctx
    );

    const extended = service.createLearnerExtended(
      'tenant_demo',
      'u_admin',
      { lastName: 'Сидорова', firstName: 'Анна', middleName: 'Петровна' },
      ctx
    );

    expect([manual.lastName, manual.firstName, manual.middleName]).toEqual([
      extended.lastName,
      extended.firstName,
      extended.middleName
    ]);
  });
});
