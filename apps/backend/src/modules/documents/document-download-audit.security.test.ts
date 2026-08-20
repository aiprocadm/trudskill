import { describe, expect, it, vi } from 'vitest';

import { DocumentsService } from './documents.service.js';

import type { RequestContext } from '../../common/context/request-context.js';

/**
 * ФТ-G1 (gap A3) — «аудит чувствительных чтений».
 *
 * Требование перечисляет прямо: в журнал действий должны попадать «генерация/скачивание
 * документов, просмотр ПДн, изменения шаблонов, impersonation». Проверка по коду показала,
 * что три пункта из четырёх закрыты (шаблоны, выпуск документа, выгрузка и обезличивание
 * персональных данных), а **скачивание — нет**.
 *
 * Почему это важно, а не «формальность ради галочки». Скачанный документ — это удостоверение
 * или протокол с фамилией, СНИЛСом и датой рождения человека. Если такой файл уйдёт наружу,
 * учебный центр обязан ответить, кто и когда его выгружал: перед слушателем, перед надзором
 * и перед проверкой по 152-ФЗ. Без записи в журнале ответить нечем — видно только, что
 * документ когда-то выпустили.
 *
 * Инвариант: получение ссылки на скачивание оставляет запись в журнале — с тем, кто скачал,
 * какой документ и какого слушателя он касается.
 */

const context = (): RequestContext => ({
  tenantId: 't1',
  userId: 'u_admin',
  requestId: 'req_1',
  correlationId: 'cor_1',
  ip: '10.0.0.1',
  userAgent: 'vitest'
});

/** Минимальное окружение сервиса: нас интересует только запись в журнал. */
const makeService = () => {
  const write = vi.fn();
  const state = {
    templates: [],
    templateVersions: [],
    templateVariables: [],
    templateBindings: [],
    numberingRules: [],
    generatedDocuments: [
      {
        id: 'doc_1',
        tenantId: 't1',
        fileId: 'file_1',
        learnerId: 'lrn_1',
        documentKind: 'certificate',
        documentNumber: 'УД-000123',
        status: 'final'
      }
    ],
    documentTasks: [],
    documentNumbers: []
  } as never;

  const service = new DocumentsService(
    state,
    { write, writeCritical: vi.fn() } as never,
    { createDownloadUrl: vi.fn() } as never,
    { emit: vi.fn() } as never
  );
  return { service, write };
};

describe('скачивание документа попадает в журнал действий (ФТ-G1)', () => {
  it('получение ссылки оставляет запись', () => {
    const { service, write } = makeService();

    service.getDocumentForDownload('t1', 'doc_1', 'u_admin', context());

    expect(
      write,
      'Скачивание документа не записано в журнал. Документ содержит ПДн слушателя; ' +
        'без записи центр не сможет ответить, кто и когда его выгрузил.'
    ).toHaveBeenCalled();
  });

  it('в записи видно, кто скачал, что именно и чей это документ', () => {
    const { service, write } = makeService();

    service.getDocumentForDownload('t1', 'doc_1', 'u_admin', context());

    const entry = write.mock.calls[0]![0] as Record<string, unknown>;
    expect(entry.action).toBe('documents.downloaded');
    expect(entry.actorId).toBe('u_admin');
    expect(entry.entityId).toBe('doc_1');
    expect(entry.tenantId).toBe('t1');
    // Без слушателя запись бесполезна для ответа субъекту ПДн: «чьи данные выгрузили».
    expect((entry.metadata as Record<string, unknown> | undefined)?.learnerId).toBe('lrn_1');
  });

  /*
   * Номер документа в записи — чтобы администратор мог сопоставить её с бумагой на руках,
   * не заглядывая в базу по идентификатору.
   */
  it('в записи есть номер документа — по нему человек и опознаёт бумагу', () => {
    const { service, write } = makeService();

    service.getDocumentForDownload('t1', 'doc_1', 'u_admin', context());

    const entry = write.mock.calls[0]![0] as Record<string, unknown>;
    const metadata = entry.metadata as Record<string, unknown>;
    expect(metadata.documentNumber).toBe('УД-000123');
  });

  it('несуществующий документ не создаёт записи о скачивании', () => {
    const { service, write } = makeService();

    expect(() =>
      service.getDocumentForDownload('t1', 'doc_missing', 'u_admin', context())
    ).toThrow();
    expect(write, 'записали скачивание того, чего нет').not.toHaveBeenCalled();
  });

  /*
   * Документ чужого центра не должен ни отдаваться, ни попадать в журнал этого центра:
   * запись о чужом документе — это и ложный след, и утечка идентификатора.
   */
  it('документ чужого центра не отдаётся и не пишется в журнал', () => {
    const { service, write } = makeService();

    expect(() => service.getDocumentForDownload('t2', 'doc_1', 'u_admin', context())).toThrow();
    expect(write).not.toHaveBeenCalled();
  });
});
