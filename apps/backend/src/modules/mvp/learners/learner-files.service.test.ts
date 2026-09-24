import { BadRequestException, NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { InMemoryLearnerFilesRepository } from './learner-files.repository.js';
import { LearnerFilesService } from './learner-files.service.js';
import { AuditService } from '../../audit/audit.service.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';

import type { LearnerFilesSettingsService } from './learner-files-settings.service.js';
import type { RequestContext } from '../../../common/context/request-context.js';
import type { FilesService } from '../../files/files.service.js';
import type { Learner } from '../mvp.types.js';

const T = 'tenant_demo';
const ctx: RequestContext = {
  requestId: 'r0',
  correlationId: 'c0',
  tenantId: T,
  userId: 'u_admin',
  ip: '127.0.0.1',
  userAgent: 'vitest'
};

function makeService(maxCount = 2) {
  const state = new InMemoryMvpState();
  const learner: Learner = {
    id: 'l_1',
    tenantId: T,
    status: 'active',
    createdAt: '2026-04-01T00:00:00.000Z',
    updatedAt: '2026-04-01T00:00:00.000Z',
    firstName: 'Иван',
    lastName: 'Иванов'
  };
  state.learners.push(learner, { ...learner, id: 'l_other', tenantId: 'tenant_other' });
  const repo = new InMemoryLearnerFilesRepository();
  const known = new Map<string, string>([
    ['file_1', 'pending'],
    ['file_2', 'clean'],
    ['file_3', 'clean']
  ]);
  for (const [fileId, antivirusStatus] of known) {
    repo.registerFile(T, {
      fileId,
      name: `${fileId}.pdf`,
      mimeType: 'application/pdf',
      sizeBytes: 1024,
      antivirusStatus
    });
  }
  const files = {
    createUploadIntent: vi.fn(async () => ({
      fileId: 'file_new',
      uploadUrl: 'https://s3.local/put',
      storageKey: 'learner-files/x',
      expiresInSeconds: 900
    })),
    getAntivirusStatus: vi.fn(async (_t: string, id: string) => known.get(id) ?? null),
    scanFile: vi.fn(async () => 'clean'),
    createDownloadUrl: vi.fn(async () => 'https://s3.local/get'),
    deleteFile: vi.fn(async () => undefined)
  } as unknown as FilesService;
  const settings = {
    forTenant: vi.fn(async () => ({ maxCount, maxBytes: 1024 * 1024 }))
  } as unknown as LearnerFilesSettingsService;
  const audit = new AuditService();
  const service = new LearnerFilesService(state, repo, files, audit, settings);
  return { service, repo, files, audit };
}

/** Файлы личного дела (МГ-C2.1, срез 9.2, РМ94–РМ96). */
describe('LearnerFilesService', () => {
  it('прикрепляет файл, запускает проверку антивирусом и пишет аудит без ПДн', async () => {
    const { service, files, audit } = makeService();
    const row = await service.attach(T, 'l_1', 'file_1', 'u_admin', ctx);
    expect(row.fileId).toBe('file_1');
    expect(row.antivirusStatus).toBe('pending');
    expect(files.scanFile).toHaveBeenCalledWith(T, 'file_1', 'u_admin');
    const list = await service.list(T, 'l_1');
    expect(list.items.map((item) => item.fileId)).toEqual(['file_1']);
    expect(list.limit).toBe(2);
    const record = (await audit.listPage(T, { action: 'learning.learner_file_attached' })).items[0];
    expect(record?.entityType).toBe('learning.learner');
    expect(record?.entityId).toBe('l_1');
    expect(record?.newValues).toEqual({ fileId: 'file_1' });
  });

  it('лимит центра: ссылка на загрузку и прикрепление отказывают понятным кодом', async () => {
    const { service, files } = makeService(2);
    await service.attach(T, 'l_1', 'file_1', 'u_admin', ctx);
    await service.attach(T, 'l_1', 'file_2', 'u_admin', ctx);
    await expect(
      service.createUploadIntent(T, 'l_1', {
        originalName: 'скан.pdf',
        contentType: 'application/pdf',
        sizeBytes: 10
      })
    ).rejects.toMatchObject({
      response: { code: 'learner_files_limit_reached' }
    });
    expect(files.createUploadIntent).not.toHaveBeenCalled();
    await expect(service.attach(T, 'l_1', 'file_3', 'u_admin', ctx)).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  it('ссылка на загрузку идёт с префиксом и лимитами файлов личного дела', async () => {
    const { service, files } = makeService();
    const intent = await service.createUploadIntent(T, 'l_1', {
      originalName: 'согласие.pdf',
      contentType: 'application/pdf',
      sizeBytes: 10
    });
    expect(intent.fileId).toBe('file_new');
    expect(files.createUploadIntent).toHaveBeenCalledWith(
      T,
      expect.objectContaining({ originalName: 'согласие.pdf' }),
      expect.objectContaining({ keyPrefix: 'learner-files', maxBytes: 1024 * 1024 })
    );
  });

  it('неизвестный файл, чужой слушатель и чужой файл — 404', async () => {
    const { service } = makeService();
    await expect(service.attach(T, 'l_1', 'file_missing', 'u_admin', ctx)).rejects.toBeInstanceOf(
      NotFoundException
    );
    await expect(service.list(T, 'l_other')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.downloadUrl(T, 'l_1', 'file_2')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('скачивание — через гейт FilesService; удаление снимает связь, стирает файл и пишет аудит', async () => {
    const { service, files, repo, audit } = makeService();
    await service.attach(T, 'l_1', 'file_2', 'u_admin', ctx);
    expect(await service.downloadUrl(T, 'l_1', 'file_2')).toEqual({ url: 'https://s3.local/get' });
    expect(files.createDownloadUrl).toHaveBeenCalledWith(T, 'file_2');

    await service.remove(T, 'l_1', 'file_2', 'u_admin', ctx);
    expect(files.deleteFile).toHaveBeenCalledWith(T, 'file_2', 'u_admin');
    expect(await repo.list(T, 'l_1')).toEqual([]);
    const record = (await audit.listPage(T, { action: 'learning.learner_file_removed' })).items[0];
    expect(record?.oldValues).toEqual({ fileId: 'file_2' });
    await expect(service.remove(T, 'l_1', 'file_2', 'u_admin', ctx)).rejects.toBeInstanceOf(
      NotFoundException
    );
  });
});
