import 'reflect-metadata';

import { describe, expect, it, vi } from 'vitest';

import { ExternalDocumentsController } from './external-documents.controller.js';
import { matchScan, scanBaseName } from './scan-matching.js';
import { AuditService } from '../../audit/audit.service.js';
import { RealtimeEventsService } from '../../core/realtime-events.service.js';
import { DocumentsService } from '../../documents/documents.service.js';
import { InMemoryDocumentsState } from '../../documents/in-memory-documents.state.js';
import { REQUIRED_PERMISSIONS } from '../../iam/permission.decorator.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';

import type { RequestContext } from '../../../common/context/request-context.js';

const T = 'tenant_demo';
const ctx = {
  requestId: 'r',
  correlationId: 'c',
  tenantId: T,
  userId: 'u_methodist'
} as RequestContext;

describe('файл → документ по номеру в имени (МГ-K6.1, срез 23.6)', () => {
  const docs = [
    { id: 'd1', number: '264501-3', learnerLastName: 'Иванов', hasScan: false },
    { id: 'd2', number: '17', learnerLastName: 'Петров', hasScan: false },
    { id: 'd3', number: '17', learnerLastName: 'Сидоров', hasScan: false },
    { id: 'd4', number: 'АБ-5', learnerLastName: 'Орлова', hasScan: true }
  ];

  it('имя без расширения, регистр и «_» не мешают', () => {
    expect(scanBaseName('Иванов_264501-3.PDF')).toBe('иванов 264501-3');
    expect(matchScan('Иванов_264501-3.PDF', docs)).toEqual({
      status: 'attach',
      documentId: 'd1',
      number: '264501-3'
    });
  });

  it('номер ищется целым словом: «1264501-35» — не «264501-3»', () => {
    expect(matchScan('1264501-35.pdf', docs)).toEqual({ status: 'not_matched' });
  });

  it('одинаковый номер у разных людей разводит фамилия; без неё — «не однозначно»', () => {
    expect(matchScan('Сидоров 17.pdf', docs)).toMatchObject({ status: 'attach', documentId: 'd3' });
    expect(matchScan('17.pdf', docs)).toEqual({ status: 'ambiguous', numbers: ['17'] });
  });

  it('у документа уже есть скан — пачкой не заменяется', () => {
    expect(matchScan('аб-5.jpg', docs)).toMatchObject({ status: 'has_scan', documentId: 'd4' });
  });
});

describe('сканы пачкой (МГ-K6.1, срез 23.6)', () => {
  const make = () => {
    const docState = new InMemoryDocumentsState();
    const documents = new DocumentsService(
      docState,
      new AuditService(),
      new RealtimeEventsService()
    );
    const state = new InMemoryMvpState();
    state.learners.push(
      { id: 'l1', tenantId: T, lastName: 'Иванов', firstName: 'Иван' } as never,
      { id: 'l2', tenantId: T, lastName: 'Петров', firstName: 'Пётр' } as never
    );
    const files = {
      getAntivirusStatus: vi.fn(async (_t: string, fileId: string) =>
        fileId === 'f_lost' ? null : 'pending'
      ),
      scanFile: vi.fn().mockResolvedValue('clean'),
      createUploadIntent: vi.fn()
    };
    const controller = new ExternalDocumentsController(state, documents, files as never);
    const register = (number: string, learnerId: string) =>
      controller.register(ctx, {
        kindCode: 'certificate.ot',
        number,
        date: '2025-02-01',
        learnerId
      });
    return { controller, documents, files, register };
  };

  it('подошедшие прикрепляются, остальные названы поимённо с причиной', async () => {
    const { controller, register, files } = make();
    const ivanov = register('264501-3', 'l1');
    register('777', 'l2');
    const result = await controller.attachScans(ctx, {
      files: [
        { fileId: 'f1', fileName: 'Иванов 264501-3.pdf' },
        { fileId: 'f2', fileName: 'неизвестно.pdf' },
        { fileId: 'f3', fileName: '264501-3 копия.pdf' },
        { fileId: 'f_lost', fileName: '777.pdf' }
      ]
    });
    expect(result).toMatchObject({ total: 4, attached: 1, skipped: 1, failed: 2 });
    expect(result.rows.map((r) => r.status)).toEqual(['attached', 'failed', 'skipped', 'failed']);
    expect(result.rows[1]!.message).toContain('прикрепите скан вручную');
    expect(result.rows[2]!.message).toContain('уже есть скан');
    expect(result.rows[3]!.message).toContain('Файл не найден');
    expect(files.scanFile).toHaveBeenCalledTimes(1);
    expect(ivanov.id).toBe(result.rows[0]!.documentId);
  });

  it('под правом записи документов, как и одиночный скан', () => {
    expect(
      Reflect.getMetadata(REQUIRED_PERMISSIONS, ExternalDocumentsController.prototype.attachScans)
    ).toEqual(['documents.write']);
  });
});
