import { NotFoundException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

import { LearnerDossierService } from './learner-dossier.service.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';

import type { RequestContext } from '../../../common/context/request-context.js';
import type { AuditService } from '../../audit/audit.service.js';
import type { DocumentsService } from '../../documents/documents.service.js';
import type { LegalLogReader } from '../esignature/legal-log.reader.js';

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

function harness(options: { legalEntries?: unknown[]; legalThrows?: boolean } = {}) {
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
          id: 'gd_other',
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
  const legalLog = {
    listByActor: async () => {
      if (options.legalThrows) throw new Error('db down');
      return options.legalEntries ?? [];
    }
  } as unknown as LegalLogReader;

  const service = new LearnerDossierService(
    state,
    { writeCritical } as unknown as AuditService,
    documents,
    legalLog
  );
  return { service, state, writeCritical };
}

function seedLearner(state: InMemoryMvpState, tenantId = T) {
  state.learners.push({
    ...base,
    id: 'lrn_1',
    tenantId,
    firstName: 'Иван',
    lastName: 'Иванов',
    middleName: 'Иванович',
    snils: '112-233-445 95',
    linkedIamUserId: 'u_l1'
  } as never);
  state.enrollments.push({
    ...base,
    id: 'enr_1',
    tenantId,
    learnerId: 'lrn_1',
    groupId: 'grp_1',
    enrolledAt: '2026-07-01T00:00:00.000Z'
  } as never);
}

describe('LearnerDossierService — личное дело (ФТ-C2)', () => {
  it('чужой тенант получает 404, а не 403', async () => {
    // 403 подтвердил бы, что такой слушатель существует.
    const h = harness();
    seedLearner(h.state, OTHER);

    await expect(h.service.compose(T, 'u_admin', 'lrn_1', ctx)).rejects.toBeInstanceOf(
      NotFoundException
    );
  });

  it('обращение пишется в 152-ФЗ access-log БЕЗ персональных данных', async () => {
    const h = harness();
    seedLearner(h.state);

    await h.service.compose(T, 'u_admin', 'lrn_1', ctx);

    const call = h.writeCritical.mock.calls[0]![0] as Record<string, unknown>;
    expect(call).toMatchObject({
      action: 'learner.personal_data_accessed',
      entityId: 'lrn_1',
      newValues: { accessedVia: 'learner_dossier' }
    });
    // Ни ФИО, ни СНИЛС в теле записи быть не должно.
    expect(JSON.stringify(call)).not.toContain('Иванов');
    expect(JSON.stringify(call)).not.toContain('112-233-445');
  });

  it('пустое дело не падает — у нового слушателя просто нет разделов', async () => {
    const h = harness();
    seedLearner(h.state);

    const dossier = await h.service.compose(T, 'u_admin', 'lrn_1', ctx);

    expect(dossier.identity.status).toBe('none');
    expect(dossier.exams).toEqual([]);
    expect(dossier.signedActions).toEqual([]);
    expect(dossier.unavailableSections).toEqual([]);
  });

  it('в деле только СВОИ документы слушателя', async () => {
    const h = harness();
    seedLearner(h.state);

    const dossier = await h.service.compose(T, 'u_admin', 'lrn_1', ctx);

    expect(dossier.documents.map((d) => d.id)).toEqual(['gd_1']);
  });

  it('берётся ПОСЛЕДНЯЯ запись идентификации, а не первая попавшаяся', async () => {
    const h = harness();
    seedLearner(h.state);
    h.state.identityVerifications.push(
      {
        ...base,
        id: 'idv_old',
        tenantId: T,
        learnerId: 'lrn_1',
        method: 'selfie_passport',
        verificationStatus: 'rejected',
        createdAt: '2026-07-01T00:00:00.000Z'
      } as never,
      {
        ...base,
        id: 'idv_new',
        tenantId: T,
        learnerId: 'lrn_1',
        method: 'selfie_passport',
        verificationStatus: 'approved',
        reviewedAt: '2026-07-20T10:00:00.000Z',
        reviewedByActorId: 'u_mod',
        createdAt: '2026-07-15T00:00:00.000Z'
      } as never
    );

    const dossier = await h.service.compose(T, 'u_admin', 'lrn_1', ctx, async () => 'Петрова Анна');

    expect(dossier.identity.status).toBe('approved');
    expect(dossier.identity.reviewedBy).toBe('Петрова Анна');
  });

  it('удаление снимков по сроку хранения показано явно', async () => {
    // Иначе проверяющий решит, что документов не было вовсе.
    const h = harness();
    seedLearner(h.state);
    h.state.identityVerifications.push({
      ...base,
      id: 'idv_1',
      tenantId: T,
      learnerId: 'lrn_1',
      method: 'selfie_passport',
      verificationStatus: 'approved',
      reviewedAt: '2026-07-20T10:00:00.000Z',
      imagesPurgedAt: '2026-10-20T10:00:00.000Z'
    } as never);

    const dossier = await h.service.compose(T, 'u_admin', 'lrn_1', ctx);

    expect(dossier.identity.imagesPurgedAt).toBe('2026-10-20T10:00:00.000Z');
    expect(dossier.identity.status).toBe('approved');
  });

  it('экзамены отдаются с длительностью и результатом', async () => {
    const h = harness();
    seedLearner(h.state);
    h.state.tests.push({ ...base, id: 'tst_1', tenantId: T, title: 'Итоговый тест' } as never);
    h.state.attempts.push({
      ...base,
      id: 'att_1',
      tenantId: T,
      learnerId: 'lrn_1',
      testId: 'tst_1',
      startedAt: '2026-07-20T10:00:00.000Z',
      finishedAt: '2026-07-20T10:35:00.000Z',
      score: 18,
      maxScore: 20,
      passed: true
    } as never);

    const dossier = await h.service.compose(T, 'u_admin', 'lrn_1', ctx);

    expect(dossier.exams[0]).toMatchObject({
      testTitle: 'Итоговый тест',
      durationMinutes: 35,
      passed: true
    });
  });

  it('недоступный журнал НЕ обрушает дело, но раздел помечается непрочитанным', async () => {
    // Пустой раздел значил бы «подписей не было» — это другое утверждение.
    const h = harness({ legalThrows: true });
    seedLearner(h.state);

    const dossier = await h.service.compose(T, 'u_admin', 'lrn_1', ctx);

    expect(dossier.signedActions).toEqual([]);
    expect(dossier.unavailableSections).toContain('signedActions');
    expect(dossier.learner.fullName).toBe('Иванов Иван Иванович');
  });

  it('подписанные действия попадают в дело', async () => {
    const h = harness({
      legalEntries: [
        {
          createdAt: '2026-07-20T10:00:00.000Z',
          eventType: 'esignature.action_signed',
          description: 'Ознакомлен с программой',
          payload: { signedWith: 'simple_electronic_signature', ip: '10.0.0.1' }
        }
      ]
    });
    seedLearner(h.state);

    const dossier = await h.service.compose(T, 'u_admin', 'lrn_1', ctx);

    expect(dossier.signedActions).toHaveLength(1);
    expect(dossier.signedActions[0]!.signedWith).toBe('simple_electronic_signature');
  });

  it('слушатель без привязки к аккаунту — пустой раздел подписей, а не сбой', async () => {
    const h = harness();
    h.state.learners.push({
      ...base,
      id: 'lrn_2',
      tenantId: T,
      firstName: 'Пётр',
      lastName: 'Петров'
    } as never);

    const dossier = await h.service.compose(T, 'u_admin', 'lrn_2', ctx);

    expect(dossier.signedActions).toEqual([]);
    expect(dossier.unavailableSections).toEqual([]);
  });
});
