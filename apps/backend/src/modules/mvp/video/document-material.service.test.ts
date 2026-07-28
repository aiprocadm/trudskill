import { PreconditionFailedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { DOCUMENT_URL_TTL_SECONDS, DocumentMaterialService } from './document-material.service.js';
import { VideoAccessService } from './video-access.service.js';

import type { RequestContext } from '../../../common/context/request-context.js';
import type { FilesService } from '../../files/files.service.js';
import type { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';
import type { MvpService } from '../mvp.service.js';

/**
 * Документы урока (ФТ-B4.1, Фаза 2 Task 9): выдача файла и фиксация открытия.
 */

const T = 'tenant_demo';
const CTX = { tenantId: T, userId: 'u1', permissions: [] } as unknown as RequestContext;

function makeState(
  overrides: { materialType?: string; minViewSeconds?: number; fileId?: string | null } = {}
) {
  return {
    materials: [
      {
        tenantId: T,
        id: 'mat_1',
        moduleId: 'mod_1',
        materialType: overrides.materialType ?? 'file',
        minViewSeconds: overrides.minViewSeconds ?? 0,
        ...(overrides.fileId === null ? {} : { fileId: overrides.fileId ?? 'file_1' })
      }
    ],
    modules: [{ tenantId: T, id: 'mod_1', courseVersionId: 'cv_1' }],
    courseVersions: [{ tenantId: T, id: 'cv_1', courseId: 'course_1' }],
    enrollments: [{ tenantId: T, id: 'enr_1', groupId: 'grp_1', learnerId: 'lrn_1' }],
    groupCourses: [{ tenantId: T, groupId: 'grp_1', courseId: 'course_1' }]
  } as unknown as InMemoryMvpState;
}

function makeService(overrides: Parameters<typeof makeState>[0] & { assertThrows?: Error } = {}) {
  const upsertMaterialProgress = vi.fn();
  const mvp = {
    assertActorMatchesLearnerIamLink: vi.fn(() => {
      if (overrides.assertThrows) throw overrides.assertThrows;
    }),
    upsertMaterialProgress
  } as unknown as MvpService;
  const access = new VideoAccessService(makeState(overrides), mvp);
  const files = {
    createDownloadUrl: vi.fn(async () => 'https://s3.local/GET-doc?sig=1')
  } as unknown as FilesService;
  return {
    service: new DocumentMaterialService(access, files, mvp),
    files,
    upsertMaterialProgress
  };
}

describe('DocumentMaterialService.open', () => {
  it('отдаёт ссылку на файл и фиксирует открытие', async () => {
    const { service, files, upsertMaterialProgress } = makeService();

    const result = await service.open(T, 'u1', 'mat_1', 'enr_1', CTX);

    expect(result.url).toContain('https://s3.local/GET-doc');
    expect(result.expiresInSeconds).toBe(DOCUMENT_URL_TTL_SECONDS);
    expect(files.createDownloadUrl).toHaveBeenCalledWith(T, 'file_1');
    // Факт открытия записан — «ознакомлен» не зависит от прокрутки до конца.
    expect(upsertMaterialProgress).toHaveBeenCalled();
  });

  it('без заданного минимального времени открытие засчитывает материал', async () => {
    const { service } = makeService({ minViewSeconds: 0 });
    const result = await service.open(T, 'u1', 'mat_1', 'enr_1', CTX);
    expect(result.completedByOpening).toBe(true);
  });

  it('заданное методистом время не отменяется открытием', async () => {
    // Методист явно потребовал выдержку по времени — молча закрывать материал нельзя.
    const { service } = makeService({ minViewSeconds: 300 });
    const result = await service.open(T, 'u1', 'mat_1', 'enr_1', CTX);
    expect(result.completedByOpening).toBe(false);
  });

  it('материал без файла даёт понятный отказ', async () => {
    const { service } = makeService({ fileId: null });
    await expect(service.open(T, 'u1', 'mat_1', 'enr_1', CTX)).rejects.toBeInstanceOf(
      PreconditionFailedException
    );
  });

  it('видео через этот путь не открывается — у него свой защищённый маршрут', async () => {
    const { service } = makeService({ materialType: 'video' });
    await expect(service.open(T, 'u1', 'mat_1', 'enr_1', CTX)).rejects.toBeInstanceOf(
      PreconditionFailedException
    );
  });

  it('чужой пользователь ссылку не получает и прогресс не пишет', async () => {
    const forbidden = new Error('actor is not the learner');
    const { service, files, upsertMaterialProgress } = makeService({ assertThrows: forbidden });

    await expect(service.open(T, 'u_other', 'mat_1', 'enr_1', CTX)).rejects.toBe(forbidden);
    expect(files.createDownloadUrl).not.toHaveBeenCalled();
    expect(upsertMaterialProgress).not.toHaveBeenCalled();
  });
});
