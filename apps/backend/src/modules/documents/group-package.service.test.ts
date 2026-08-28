import { Readable } from 'node:stream';

import AdmZip from 'adm-zip';
import { describe, expect, it, vi } from 'vitest';

import { DocumentsService } from './documents.service.js';
import { GroupPackageService } from './group-package.service.js';
import { InMemoryDocumentsState } from './in-memory-documents.state.js';
import { AuditService } from '../audit/audit.service.js';
import { RealtimeEventsService } from '../core/realtime-events.service.js';

import type { TemplateType } from './documents.types.js';
import type { RequestContext } from '../../common/context/request-context.js';
import type { S3StorageClient } from '../../infrastructure/storage/s3-storage.client.js';
import type { FilesService } from '../files/files.service.js';

/**
 * ФТ-A5.2 — выгрузка комплекта группы одним ZIP (Фаза 1 Task 7b).
 *
 * Сценарий: группа закрыта, админу нужно отдать пачку в бумажный архив
 * или отправить заказчику. Ходить по 25 документам поштучно — не вариант.
 */

const T = 't1';
const ctx = {
  requestId: 'r1',
  correlationId: 'c1',
  ip: '127.0.0.1',
  userAgent: 'vitest',
  tenantId: T,
  userId: 'u1'
} as unknown as RequestContext;

function makeStack() {
  const state = new InMemoryDocumentsState();
  const documents = new DocumentsService(state, new AuditService(), new RealtimeEventsService());
  const template = (name: string, templateType: TemplateType) => {
    const tpl = documents.createTemplate(T, 'u1', { name, templateType }, ctx);
    const version = documents.createTemplateVersion(T, 'u1', {
      templateId: tpl.id,
      fileId: `file_${name}`
    });
    documents.activateTemplateVersion(T, 'u1', version.id, ctx);
    return tpl.id;
  };
  const protocolTemplateId = template('Протокол', 'protocol');
  const certificateTemplateId = template('Удостоверение', 'certificate');

  // Файловый слой: содержимое = сам storageKey, чтобы в тесте легко сверять.
  const files = {
    getReadableFile: vi.fn(async (_t: string, fileId: string) => ({
      storageKey: `pdf/${fileId}`,
      sizeBytes: 10
    }))
  } as unknown as FilesService;
  const storage = {
    getObjectStream: vi.fn(async ({ key }: { key: string }) =>
      Readable.from([Buffer.from(`PDF:${key}`)])
    )
  } as unknown as S3StorageClient;

  const packages = new GroupPackageService(documents, files, storage);
  return { state, documents, packages, files, storage, protocolTemplateId, certificateTemplateId };
}

/** Закрывает группу и доводит задачи до готового документа с PDF. */
function closeAndComplete(
  stack: ReturnType<typeof makeStack>,
  enrollmentIds: string[],
  opts: { failLast?: boolean } = {}
) {
  const { documents, protocolTemplateId, certificateTemplateId } = stack;
  const result = documents.closeGroup(
    T,
    'u1',
    { groupId: 'g1', protocolTemplateId, certificateTemplateId, enrollmentIds },
    ctx
  );
  const tasks = [result.protocol, ...result.certificates];
  tasks.forEach((task, index) => {
    const isLast = index === tasks.length - 1;
    if (opts.failLast && isLast) {
      documents.startTask(T, task.id);
      documents.failTask(T, task.id, 'gotenberg timeout');
      return;
    }
    documents.completeTask(T, task.id, `docx_${index}`, undefined, {
      pdfFileId: `pdf_${index}`
    });
  });
  return result;
}

describe('GroupPackageService.buildGroupZip (ФТ-A5.2)', () => {
  it('кладёт в архив PDF всех готовых документов группы', async () => {
    const stack = makeStack();
    closeAndComplete(stack, ['e1', 'e2']);

    const zip = await stack.packages.buildGroupZip(T, 'g1');

    const names = new AdmZip(zip)
      .getEntries()
      .map((e) => e.entryName)
      .sort();
    expect(names).toHaveLength(3); // протокол + 2 удостоверения
    expect(names.every((n) => n.endsWith('.pdf'))).toBe(true);
  });

  it('именует файлы по номеру документа — архив читается без базы', async () => {
    const stack = makeStack();
    closeAndComplete(stack, ['e1']);

    const zip = await stack.packages.buildGroupZip(T, 'g1');

    const names = new AdmZip(zip).getEntries().map((e) => e.entryName);
    // Номер выдаётся нумератором (PROTOCOL-000001 / CERTIFICATE-000001).
    expect(names.some((n) => n.includes('PROTOCOL-000001'))).toBe(true);
    expect(names.some((n) => n.includes('CERTIFICATE-000001'))).toBe(true);
  });

  it('содержимое берётся из хранилища как есть', async () => {
    const stack = makeStack();
    closeAndComplete(stack, ['e1']);

    const zip = await stack.packages.buildGroupZip(T, 'g1');

    const entry = new AdmZip(zip).getEntries()[0]!;
    expect(entry.getData().toString()).toMatch(/^PDF:pdf\/pdf_\d+$/);
  });

  it('пропускает незавершённые документы, а не падает на них', async () => {
    const stack = makeStack();
    closeAndComplete(stack, ['e1', 'e2'], { failLast: true });

    const zip = await stack.packages.buildGroupZip(T, 'g1');

    // Упавшее удостоверение в архив не попадает — остальное отдаётся.
    expect(new AdmZip(zip).getEntries()).toHaveLength(2);
  });

  it('отказывается собирать архив пустой группы — оператору нужен внятный ответ', async () => {
    const stack = makeStack();

    await expect(stack.packages.buildGroupZip(T, 'g1')).rejects.toThrow(/no documents/i);
  });

  it('не собирает документы чужого тенанта', async () => {
    const stack = makeStack();
    closeAndComplete(stack, ['e1']);

    await expect(stack.packages.buildGroupZip('t2', 'g1')).rejects.toThrow(/no documents/i);
  });

  it('не тянет из хранилища документ без PDF', async () => {
    const stack = makeStack();
    const result = stack.documents.closeGroup(
      T,
      'u1',
      {
        groupId: 'g1',
        protocolTemplateId: stack.protocolTemplateId,
        certificateTemplateId: stack.certificateTemplateId,
        enrollmentIds: ['e1']
      },
      ctx
    );
    // Задача завершена, но PDF не приложен (старый документ до ФТ-A1.3).
    stack.documents.completeTask(T, result.protocol.id, 'docx_only');
    stack.documents.completeTask(T, result.certificates[0]!.id, 'docx_2', undefined, {
      pdfFileId: 'pdf_ok'
    });

    const zip = await stack.packages.buildGroupZip(T, 'g1');

    expect(new AdmZip(zip).getEntries()).toHaveLength(1);
    expect(stack.files.getReadableFile).toHaveBeenCalledTimes(1);
  });
});
