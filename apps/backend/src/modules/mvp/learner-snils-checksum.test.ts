import { EventEmitter2 } from '@nestjs/event-emitter';
import { describe, expect, it } from 'vitest';

import { InMemoryMvpState } from './infrastructure/in-memory-mvp.state.js';
import { MvpService } from './mvp.service.js';
import { TenantScopedRepository } from '../../infrastructure/database/tenant-repository.js';
import { AuditService } from '../audit/audit.service.js';

import type { DocumentsService } from '../documents/documents.service.js';
import type { FilesService } from '../files/files.service.js';

/**
 * ФТ-C4.1: СНИЛС проверяется по контрольной сумме **при вводе**, а не только на выгрузке.
 *
 * До этого среза проверка стояла в трёх местах: массовый импорт из Excel, допуск к экзамену
 * и preflight пяти госреестров. Ручной ввод в карточке слушателя — единственный путь, где
 * СНИЛС сохранялся как есть.
 *
 * Цена пропуска отложенная и дорогая: опечатка живёт в базе месяцами и всплывает в день
 * сдачи отчётности — либо выгрузка блокируется целиком (ФТ-C4.1 запрещает «частичный
 * успех»), либо реестр отвергает запись, и человек в нём просто не появляется. Чем позже
 * находится опечатка, тем дороже: на этапе ввода рядом сидит тот, кто держит зелёную
 * карточку в руках.
 */

const T = 'tenant_demo';

const ctx = {
  requestId: 'req_1',
  correlationId: 'corr_1',
  tenantId: T,
  userId: 'u_admin',
  ip: '127.0.0.1',
  userAgent: 'vitest'
};

const noopDocumentsService = {
  listDocuments: () => ({ items: [], page: 1, pageSize: 50, total: 0 })
} as unknown as DocumentsService;

const noopFilesService = {
  createUploadIntent: async () => ({ fileId: 'file_stub' })
} as unknown as FilesService;

const harness = () =>
  new MvpService(
    new InMemoryMvpState(),
    new TenantScopedRepository(),
    new AuditService(),
    noopDocumentsService,
    noopFilesService,
    new EventEmitter2()
  );

/* Контрольная сумма сходится: 1·9+1·8+2·7+2·6+3·5+3·4+4·3+4·2+5·1 = 95. */
const VALID = '11223344595';
/* Те же девять цифр, но контрольное число подменено — ровно то, что даёт опечатка. */
const BROKEN = '11223344500';

describe('ФТ-C4.1 · СНИЛС проверяется при вводе в карточку слушателя', () => {
  it('заведение карточки с непроходящим СНИЛС отклоняется', () => {
    const service = harness();

    expect(() =>
      service.createLearnerExtended(
        T,
        ctx.userId,
        { firstName: 'Иван', lastName: 'Иванов', snils: BROKEN },
        ctx
      )
    ).toThrowError(/СНИЛС/);
  });

  it('правка карточки с непроходящим СНИЛС отклоняется', () => {
    const service = harness();
    const learner = service.createLearnerExtended(
      T,
      ctx.userId,
      { firstName: 'Иван', lastName: 'Иванов' },
      ctx
    );

    expect(() =>
      service.updateLearnerExtended(T, ctx.userId, learner.id, { snils: BROKEN }, ctx)
    ).toThrowError(/СНИЛС/);
    // Отказ обязан быть полным: в базе не должно остаться половины правки.
    expect(service.getLearner(T, learner.id).snils).toBeUndefined();
  });

  it('верный СНИЛС сохраняется — и в маске, и цифрами', () => {
    const service = harness();

    const plain = service.createLearnerExtended(
      T,
      ctx.userId,
      { firstName: 'Пётр', lastName: 'Петров', snils: VALID },
      ctx
    );
    expect(plain.snils).toBe(VALID);

    // Человек вводит СНИЛС так, как он напечатан на карточке: с дефисами и пробелом.
    const masked = service.createLearnerExtended(
      T,
      ctx.userId,
      { firstName: 'Анна', lastName: 'Сидорова', snils: '112-233-445 95' },
      ctx
    );
    expect(masked.snils).toBe('112-233-445 95');
  });

  it('пустой СНИЛС по-прежнему допустим: он обязателен для выгрузки, а не для карточки', () => {
    const service = harness();
    const learner = service.createLearnerExtended(
      T,
      ctx.userId,
      { firstName: 'Без', lastName: 'СНИЛСа' },
      ctx
    );

    expect(learner.snils).toBeUndefined();
    // Очистка поля — это тоже «не указан», а не ошибка ввода.
    expect(() =>
      service.updateLearnerExtended(T, ctx.userId, learner.id, { snils: null }, ctx)
    ).not.toThrow();
  });

  it('слишком короткий набор цифр — тоже отказ, а не молчаливое сохранение', () => {
    const service = harness();

    expect(() =>
      service.createLearnerExtended(
        T,
        ctx.userId,
        { firstName: 'Иван', lastName: 'Иванов', snils: '123' },
        ctx
      )
    ).toThrowError(/СНИЛС/);
  });
});
