import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { LearnerPiiService } from './learner-pii.service.js';
import { ERASED_PLACEHOLDER } from './learner-pii.util.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';

import type { RequestContext } from '../../../common/context/request-context.js';
import type { AuditService } from '../../audit/audit.service.js';
import type { DocumentsService } from '../../documents/documents.service.js';

const T = 'tenant_demo';
const OTHER = 'tenant_other';
const ctx = {
  tenantId: T,
  requestId: 'r1',
  correlationId: 'c1',
  userId: 'u_admin',
  ip: '127.0.0.1',
  userAgent: 'vitest'
} as RequestContext;

const base = {
  status: 'active',
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z'
};

function harness() {
  const state = new InMemoryMvpState();
  const writeCritical = vi.fn(async () => undefined);
  const documents = {
    listDocuments: () => ({
      items: [
        {
          id: 'gd_1',
          sourceEntityType: 'enrollment',
          sourceEntityId: 'enr_1',
          documentType: 'certificate',
          documentNumber: 'УД-1',
          documentDate: '2026-07-10',
          status: 'issued'
        },
        {
          id: 'gd_foreign',
          sourceEntityType: 'enrollment',
          sourceEntityId: 'enr_foreign',
          documentType: 'certificate',
          status: 'issued'
        }
      ],
      page: 1,
      pageSize: 50,
      total: 2
    })
  } as unknown as DocumentsService;

  const service = new LearnerPiiService(
    state,
    { writeCritical } as unknown as AuditService,
    documents
  );
  return { service, state, writeCritical };
}

function seed(state: InMemoryMvpState, tenantId = T) {
  state.learners.push({
    ...base,
    id: 'lrn_1',
    tenantId,
    learnerNo: 'СЛ-001',
    firstName: 'Иван',
    lastName: 'Иванов',
    middleName: 'Иванович',
    email: 'ivanov@example.com',
    phone: '+7 900 000-00-00',
    snils: '112-233-445 95',
    dateOfBirth: '1990-05-17',
    position: 'слесарь',
    linkedIamUserId: 'u_l1'
  } as never);
  state.enrollments.push({
    ...base,
    id: 'enr_1',
    tenantId,
    learnerId: 'lrn_1',
    groupId: 'grp_1',
    courseId: 'crs_1'
  } as never);
  state.attempts.push({
    ...base,
    id: 'att_1',
    tenantId,
    learnerId: 'lrn_1',
    testId: 'tst_1',
    startedAt: '2026-07-05T09:00:00.000Z',
    finishedAt: '2026-07-05T09:30:00.000Z',
    score: 18,
    maxScore: 20,
    passed: true
  } as never);
  state.identityVerifications.push({
    ...base,
    id: 'idv_1',
    tenantId,
    learnerId: 'lrn_1',
    method: 'selfie_passport',
    verificationStatus: 'approved',
    selfieFileId: 'f_selfie',
    passportFileId: 'f_passport',
    consentAt: '2026-07-02T00:00:00.000Z',
    reviewedAt: '2026-07-03T00:00:00.000Z'
  } as never);
  state.proctoringRecordings.push({
    ...base,
    id: 'prc_1',
    tenantId,
    learnerId: 'lrn_1',
    groupId: 'grp_1',
    courseId: 'crs_1',
    recordingStatus: 'completed',
    consentAt: '2026-07-05T08:55:00.000Z',
    startedAt: '2026-07-05T09:00:00.000Z',
    chunks: [{ sequence: 0, fileId: 'f_chunk0', uploadedIntentAt: '2026-07-05T09:01:00.000Z' }]
  } as never);
}

describe('LearnerPiiService — выгрузка ПДн (ФТ-G6)', () => {
  it('отдаёт все персональные поля слушателя, включая те, которых нет в личном деле', async () => {
    const { service, state } = harness();
    seed(state);

    const dump = await service.exportPersonalData(T, 'u_admin', 'lrn_1', ctx);

    expect(dump.subject).toMatchObject({
      learnerId: 'lrn_1',
      firstName: 'Иван',
      snils: '112-233-445 95',
      dateOfBirth: '1990-05-17',
      // В PDF-дело телефон и привязка к учётке не попадают — а в выгрузку обязаны.
      phone: '+7 900 000-00-00',
      linkedIamUserId: 'u_l1'
    });
    expect(dump.enrollments).toHaveLength(1);
    expect(dump.examAttempts[0]).toMatchObject({ id: 'att_1', passed: true });
  });

  it('в выгрузку попадают только документы этого слушателя', async () => {
    const { service, state } = harness();
    seed(state);

    const dump = await service.exportPersonalData(T, 'u_admin', 'lrn_1', ctx);

    expect(dump.documents.map((d) => d.id)).toEqual(['gd_1']);
  });

  it('снимки лица и паспорта не вкладываются — только сведения о том, что они есть', async () => {
    const { service, state } = harness();
    seed(state);

    const dump = await service.exportPersonalData(T, 'u_admin', 'lrn_1', ctx);
    const serialized = JSON.stringify(dump);

    expect(dump.identityVerifications[0]).toMatchObject({ hasStoredImages: true });
    expect(serialized).not.toContain('f_selfie');
    expect(serialized).not.toContain('f_passport');
    expect(serialized).not.toContain('f_chunk0');
  });

  it('пишет запись доступа без персональных данных в теле', async () => {
    const { service, state, writeCritical } = harness();
    seed(state);

    await service.exportPersonalData(T, 'u_admin', 'lrn_1', ctx);

    const entry = writeCritical.mock.calls[0]![0] as unknown as Record<string, unknown>;
    expect(entry.action).toBe('learner.personal_data_exported');
    expect(entry.entityId).toBe('lrn_1');
    expect(JSON.stringify(entry.newValues)).not.toContain('Иванов');
  });

  it('чужой тенант получает 404, а не чужие данные', async () => {
    const { service, state } = harness();
    seed(state, OTHER);

    await expect(service.exportPersonalData(T, 'u_admin', 'lrn_1', ctx)).rejects.toBeInstanceOf(
      NotFoundException
    );
  });
});

describe('LearnerPiiService — обезличивание по отзыву согласия (ФТ-G6)', () => {
  it('стирает опознающие поля карточки', async () => {
    const { service, state } = harness();
    seed(state);

    await service.erasePersonalData(T, 'u_admin', 'lrn_1', ctx, 'заявление от 05.08.2026');

    const learner = state.learners[0]!;
    expect(learner.lastName).toBe(ERASED_PLACEHOLDER);
    expect(learner.snils).toBeUndefined();
    expect(learner.email).toBeUndefined();
    expect(learner.dateOfBirth).toBeUndefined();
    // Привязка к учётной записи снимается: по ней личность восстанавливается.
    expect(learner.linkedIamUserId).toBeUndefined();
  });

  it('документы и зачисления остаются — они хранятся по обязанности закона', async () => {
    const { service, state } = harness();
    seed(state);

    const report = await service.erasePersonalData(T, 'u_admin', 'lrn_1', ctx);

    expect(state.enrollments).toHaveLength(1);
    expect(report.retained.some((r) => r.what.includes('выданные документы: 1'))).toBe(true);
    expect(report.retained.every((r) => r.reason.length > 0)).toBe(true);
  });

  it('биометрия отзывается сразу, не дожидаясь срока хранения', async () => {
    const { service, state } = harness();
    seed(state);

    const report = await service.erasePersonalData(T, 'u_admin', 'lrn_1', ctx);

    expect(state.identityVerifications[0]!.selfieFileId).toBeUndefined();
    expect(state.identityVerifications[0]!.passportFileId).toBeUndefined();
    expect(state.identityVerifications[0]!.imagesPurgedAt).toBeTruthy();
    expect(state.proctoringRecordings[0]!.chunks).toHaveLength(0);
    expect(report.identityImagesPurged).toBe(2);
  });

  it('в журнал попадают имена стёртых полей, но не их значения', async () => {
    const { service, state, writeCritical } = harness();
    seed(state);

    await service.erasePersonalData(T, 'u_admin', 'lrn_1', ctx, 'отзыв согласия');

    const entry = writeCritical.mock.calls[0]![0] as unknown as Record<string, unknown>;
    expect(entry.action).toBe('learner.personal_data_erased');
    const body = JSON.stringify(entry.newValues);
    expect(body).toContain('snils');
    expect(body).not.toContain('112-233-445 95');
    expect(body).not.toContain('Иванов');
  });

  it('чужой тенант ничего не стирает', async () => {
    const { service, state } = harness();
    seed(state, OTHER);

    await expect(service.erasePersonalData(T, 'u_admin', 'lrn_1', ctx)).rejects.toBeInstanceOf(
      NotFoundException
    );
    expect(state.learners[0]!.lastName).toBe('Иванов');
  });
});
