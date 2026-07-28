import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { DocumentsInternalWorkerController } from './documents-internal-worker.controller.js';
import { DocumentsService } from './documents.service.js';
import { InMemoryDocumentsState } from './in-memory-documents.state.js';
import { AuditService } from '../audit/audit.service.js';
import { RealtimeEventsService } from '../core/realtime-events.service.js';

import type { RequestContext } from '../../common/context/request-context.js';
import type { FilesService } from '../files/files.service.js';

const T = 'tenant_demo';
const ctx: RequestContext = {
  requestId: 'req_1',
  correlationId: 'corr_1',
  tenantId: T,
  userId: 'u_admin',
  ip: '127.0.0.1',
  userAgent: 'vitest'
};

/** Один общий DocumentsService на тест — фейковый runner просто передаёт его внутрь. */
function makeHarness() {
  const documents = new DocumentsService(
    new InMemoryDocumentsState(),
    new AuditService(),
    new RealtimeEventsService()
  );
  const runner = {
    runWithTenantDocuments: async <R>(_tenantId: string, fn: (d: DocumentsService) => Promise<R>) =>
      fn(documents)
  };
  let uploadSeq = 0;
  const files = {
    createDownloadUrl: vi.fn(async () => 'https://s3.local/GET-template'),
    // Реальный files-модуль выдаёт НОВЫЙ fileId на каждый интент — DOCX и PDF не должны слиться.
    createUploadIntent: vi.fn(async (_t: string, input: { originalName: string }) => {
      uploadSeq += 1;
      return {
        fileId: `file_result_${uploadSeq}`,
        uploadUrl: `https://s3.local/PUT-${uploadSeq}`,
        storageKey: `generated-documents/t/${input.originalName}`,
        expiresInSeconds: 900
      };
    })
  };
  // Сборщик словаря (Task 4) в этих тестах заглушен — его собственные тесты отдельно.
  const variables = {
    build: vi.fn(async () => ({ 'document.number': 'N-1', 'learner.full_name': 'Иванов И. И.' }))
  };
  // Реквизиты тенанта: из них берутся подпись и печать (ФТ-A7.1).
  const tenants = {
    getRequisites: vi.fn(async () => ({
      tenantId: 't',
      legalName: 'ООО УЦ',
      taxNumber: '7701',
      payload: {}
    }))
  };
  const controller = new DocumentsInternalWorkerController(
    runner as never,
    variables as never,
    files as unknown as FilesService,
    tenants as never
  );
  return { documents, controller, files, variables, tenants };
}

let seedCounter = 0;
function seedTask(documents: DocumentsService) {
  seedCounter += 1;
  const template = documents.createTemplate(
    T,
    'u_admin',
    { name: 'Удостоверение', templateType: 'certificate' },
    ctx
  );
  const version = documents.createTemplateVersion(T, 'u_admin', {
    templateId: template.id,
    fileId: 'file_template_docx'
  });
  documents.activateTemplateVersion(T, 'u_admin', version.id, ctx);
  return documents.generateDocument(
    T,
    'u_admin',
    {
      idempotencyKey: `idem-${seedCounter}`,
      templateId: template.id,
      documentType: 'certificate'
    },
    ctx
  );
}

describe('DocumentsInternalWorkerController (Фаза 1 Task 2)', () => {
  it('start claims a queued task: number reserved, presigned template URL, variables', async () => {
    const { documents, controller, files, variables } = makeHarness();
    const task = seedTask(documents);
    const res = (await controller.start({ tenantId: T, taskId: task.id })) as Record<
      string,
      unknown
    >;
    expect(res.claimed).toBe(true);
    expect(res.templateFileUrl).toBe('https://s3.local/GET-template');
    expect(files.createDownloadUrl).toHaveBeenCalledWith(T, 'file_template_docx');
    expect(res.number).toBeTruthy();
    expect(variables.build).toHaveBeenCalled();
    expect((res.variables as Record<string, unknown>)['learner.full_name']).toBe('Иванов И. И.');
    expect(documents.getDocumentTask(T, task.id).status).toBe('running');
  });

  it('start отдаёт ссылки на подпись и печать центра (ФТ-A7.1)', async () => {
    const { documents, controller, variables, tenants, files } = makeHarness();
    tenants.getRequisites.mockResolvedValue({
      tenantId: T,
      legalName: 'ООО УЦ',
      taxNumber: '7701',
      payload: { documentImages: { stamp: { fileId: 'file_stamp', widthMm: 30 } } }
    });
    variables.build.mockResolvedValue({
      'document.number': 'N-1',
      'tenant.stamp_image': 'file_stamp',
      'tenant.signature_image': ''
    });
    files.createDownloadUrl.mockImplementation(
      async (_t: string, fileId: string) => `https://s3.local/GET-${fileId}`
    );

    const task = seedTask(documents);
    const res = (await controller.start({ tenantId: T, taskId: task.id })) as Record<
      string,
      unknown
    >;

    // Пустая переменная картинки в список не попадает — качать нечего.
    expect(res.images).toEqual([
      { name: 'tenant.stamp_image', url: 'https://s3.local/GET-file_stamp', widthMm: 30 }
    ]);
  });

  it('недоступный файл подписи не срывает выдачу документа (ФТ-A7.1)', async () => {
    const { documents, controller, variables, files } = makeHarness();
    variables.build.mockResolvedValue({ 'tenant.stamp_image': 'file_stamp' });
    files.createDownloadUrl.mockImplementation(async (_t: string, fileId: string) => {
      if (fileId === 'file_stamp') throw new Error('файл удалён');
      return 'https://s3.local/GET-template';
    });

    const task = seedTask(documents);
    const res = (await controller.start({ tenantId: T, taskId: task.id })) as Record<
      string,
      unknown
    >;

    expect(res.claimed).toBe(true);
    expect(res.templateFileUrl).toBe('https://s3.local/GET-template');
    expect(res.images).toEqual([]);
  });

  it('start is re-claimable while running (worker retry) but not after completion', async () => {
    const { documents, controller } = makeHarness();
    const task = seedTask(documents);
    await controller.start({ tenantId: T, taskId: task.id });
    const again = (await controller.start({ tenantId: T, taskId: task.id })) as Record<
      string,
      unknown
    >;
    expect(again.claimed).toBe(true);

    await controller.complete({ tenantId: T, taskId: task.id, fileId: 'file_result_1' });
    const afterComplete = (await controller.start({ tenantId: T, taskId: task.id })) as Record<
      string,
      unknown
    >;
    expect(afterComplete).toEqual({ claimed: false, status: 'completed' });
  });

  it('start on an unknown task propagates 404 (worker retries the state race)', async () => {
    const { controller } = makeHarness();
    await expect(controller.start({ tenantId: T, taskId: 'dtask_missing' })).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it('complete registers the generated document with the reserved number', async () => {
    const { documents, controller } = makeHarness();
    const task = seedTask(documents);
    const started = (await controller.start({ tenantId: T, taskId: task.id })) as Record<
      string,
      unknown
    >;
    const res = (await controller.complete({
      tenantId: T,
      taskId: task.id,
      fileId: 'file_result_1'
    })) as Record<string, unknown>;
    expect(res.generatedDocumentId).toBeTruthy();
    expect(res.documentNumber).toBe(started.number);
  });

  it('fail marks the task failed; failing after completion answers idempotently', async () => {
    const { documents, controller } = makeHarness();
    const task = seedTask(documents);
    await controller.start({ tenantId: T, taskId: task.id });
    const failed = (await controller.fail({
      tenantId: T,
      taskId: task.id,
      message: 'Template render failed: unclosed loop'
    })) as Record<string, unknown>;
    expect(failed.status).toBe('failed');
    expect(documents.getDocumentTask(T, task.id).errorMessage).toContain('unclosed loop');

    const task2 = seedTask(documents);
    await controller.start({ tenantId: T, taskId: task2.id });
    await controller.complete({ tenantId: T, taskId: task2.id, fileId: 'f' });
    const afterComplete = (await controller.fail({
      tenantId: T,
      taskId: task2.id,
      message: 'late duplicate'
    })) as Record<string, unknown>;
    expect(afterComplete.status).toBe('completed');
  });

  it('result-upload-intent asks files-module for a DOCX/PDF-only presigned PUT', async () => {
    const { controller, files } = makeHarness();
    const res = (await controller.resultUploadIntent({
      tenantId: T,
      taskId: 'dtask_1',
      sizeBytes: 12_345
    })) as Record<string, unknown>;
    expect(res.fileId).toBe('file_result_1');
    const [tenantArg, inputArg, optionsArg] = files.createUploadIntent.mock.calls[0]!;
    expect(tenantArg).toBe(T);
    expect(inputArg).toMatchObject({ originalName: 'dtask_1.docx', sizeBytes: 12_345 });
    expect((optionsArg as { keyPrefix: string }).keyPrefix).toBe('generated-documents');
  });

  it('result-upload-intent derives the .pdf extension from the content type (ФТ-A1.3)', async () => {
    const { controller, files } = makeHarness();
    await controller.resultUploadIntent({
      tenantId: T,
      taskId: 'dtask_1',
      sizeBytes: 999,
      contentType: 'application/pdf'
    });
    const [, inputArg] = files.createUploadIntent.mock.calls[0]!;
    expect(inputArg).toMatchObject({
      originalName: 'dtask_1.pdf',
      contentType: 'application/pdf'
    });
  });

  it('complete stores both formats and the substitution snapshot (ФТ-A1.3/A1.4)', async () => {
    const { documents, controller } = makeHarness();
    const task = seedTask(documents);
    await controller.start({ tenantId: T, taskId: task.id });
    const snapshot = {
      'document.number': '26-ОТ-0001',
      'learner.full_name': 'Иванов Иван Иванович'
    };
    const res = (await controller.complete({
      tenantId: T,
      taskId: task.id,
      fileId: 'file_docx_1',
      pdfFileId: 'file_pdf_1',
      variablesSnapshot: snapshot
    })) as Record<string, unknown>;

    expect(res.pdfFileId).toBe('file_pdf_1');
    const stored = documents.getDocument(T, res.generatedDocumentId as string);
    expect(stored.fileId).toBe('file_docx_1');
    expect(stored.pdfFileId).toBe('file_pdf_1');
    expect(stored.variablesSnapshot).toEqual(snapshot);
  });

  it('complete without a pdf/snapshot still works (fields stay unset, not null)', async () => {
    const { documents, controller } = makeHarness();
    const task = seedTask(documents);
    await controller.start({ tenantId: T, taskId: task.id });
    const res = (await controller.complete({
      tenantId: T,
      taskId: task.id,
      fileId: 'file_docx_only'
    })) as Record<string, unknown>;
    const stored = documents.getDocument(T, res.generatedDocumentId as string);
    expect(stored.fileId).toBe('file_docx_only');
    expect('pdfFileId' in stored).toBe(false);
    expect('variablesSnapshot' in stored).toBe(false);
  });
});
