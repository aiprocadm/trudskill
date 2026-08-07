import { Inject, Injectable, PreconditionFailedException, Scope } from '@nestjs/common';

import { partitionChainCandidates } from './close-group-chain.js';
import { MVP_STATE } from './infrastructure/mvp-state.token.js';
import { MvpService } from './mvp.service.js';
import { OtRegistryService } from './ot-registry/ot-registry.service.js';
import { AuditService } from '../audit/audit.service.js';
import { DocumentsService } from '../documents/documents.service.js';

import type { ChainSkippedEnrollment } from './close-group-chain.js';
import type { InMemoryMvpState } from './infrastructure/in-memory-mvp.state.js';
import type { CloseGroupChainOutcome } from './mvp.types.js';
import type { RequestContext } from '../../common/context/request-context.js';

export interface CloseGroupChainRequestInput {
  groupId: string;
  courseId: string;
  protocolTemplateId: string;
  certificateTemplateId: string;
  idempotencyKey: string;
  format?: 'xlsx' | 'xml';
}

/**
 * ФТ-E3 (Фаза 5 Task 7): «экзамен → протокол → документы → строки реестра» одной
 * операцией с отчётом по шагам.
 *
 * Цепочка — ОРКЕСТРОВКА поверх готовых шагов, а не их переписывание: проверка
 * готовности (ФТ-E3.2), закрытие группы (`DocumentsService.closeGroup`, идемпотентно
 * по детерминированным ключам) и выгрузка реестра (`OtRegistryService`, частичный
 * успех по строкам) продолжают работать и по отдельности.
 *
 * Частичный успех: слушатель, не дошедший до документов (не сдал, нет СНИЛС, не
 * завершил обучение), отсеивается ПОИМЁННО и не отменяет выпуск остальным.
 * «Всё или ничего» остаётся только у проблем уровня группы (комиссия, программа):
 * протокол один на всех, и без комиссии цепочки нет.
 *
 * Живёт отдельным сервисом: `MvpService` не может звать `OtRegistryService`
 * (тот сам зависит от `MvpService` — цикл повесил бы приложение при старте).
 */
@Injectable({ scope: Scope.REQUEST })
export class CloseGroupChainService {
  constructor(
    @Inject(MVP_STATE) private readonly state: InMemoryMvpState,
    @Inject(MvpService) private readonly mvp: MvpService,
    @Inject(DocumentsService) private readonly documents: DocumentsService,
    @Inject(OtRegistryService) private readonly otRegistry: OtRegistryService,
    @Inject(AuditService) private readonly auditService: AuditService
  ) {}

  async runChain(
    tenantId: string,
    actorId: string | undefined,
    request: CloseGroupChainRequestInput,
    context: RequestContext
  ): Promise<CloseGroupChainOutcome> {
    // Идемпотентность всей цепочки: повтор с тем же ключом возвращает прежний отчёт
    // и НЕ создаёт вторую выгрузку. Документы дополнительно защищены детерминированными
    // ключами closeGroup — второй комплект не выйдет даже с новым ключом.
    const cachedRecord = this.state.closeGroupChainIdempotency.find(
      (r) => r.tenantId === tenantId && r.idempotencyKey === request.idempotencyKey
    );
    if (cachedRecord) {
      return { ...cachedRecord.outcome, cached: true };
    }

    const readiness = this.mvp.getExamReadiness(tenantId, request.groupId, request.courseId);
    const blocking = readiness.issues.filter((issue) => issue.scope !== 'learner');
    if (blocking.length > 0) {
      // Протокол один на всех: неполная комиссия или программа без паспорта — брак
      // всего комплекта, частичный успех здесь невозможен.
      throw new PreconditionFailedException({
        code: 'exam_not_ready',
        message: 'Цепочку нельзя запустить: есть проблемы уровня группы',
        issues: blocking
      });
    }

    const enrollments = this.state.enrollments.filter(
      (e) => e.tenantId === tenantId && e.groupId === request.groupId
    );
    const partition = partitionChainCandidates({
      enrollments,
      examResultsByEnrollmentId: new Map(
        enrollments.map((e) => [
          e.id,
          this.state.examResults.filter(
            (er) => er.tenantId === tenantId && er.enrollmentId === e.id
          )
        ])
      ),
      learnersById: new Map(
        this.state.learners.filter((l) => l.tenantId === tenantId).map((l) => [l.id, l])
      ),
      learnerIssues: readiness.issues
    });

    const outcome = await this.executeSteps(tenantId, actorId, request, partition, context);

    this.state.closeGroupChainIdempotency.push({
      id: `closechain_${Math.random().toString(36).slice(2, 10)}`,
      tenantId,
      idempotencyKey: request.idempotencyKey,
      outcome,
      createdAt: new Date().toISOString()
    });
    this.auditService.write({
      tenantId,
      actorId,
      action: 'learning.group_close_chain',
      entityType: 'learning.group',
      entityId: request.groupId,
      metadata: {
        eligible: outcome.eligible,
        skipped: partition.skipped.length,
        documentsCreated: outcome.documents?.created ?? 0,
        registryBatchId: outcome.registry?.batchId
      },
      requestId: context.requestId,
      correlationId: context.correlationId,
      ip: context.ip,
      userAgent: context.userAgent
    });
    return outcome;
  }

  private async executeSteps(
    tenantId: string,
    actorId: string | undefined,
    request: CloseGroupChainRequestInput,
    partition: { eligibleEnrollmentIds: string[]; skipped: ChainSkippedEnrollment[] },
    context: RequestContext
  ): Promise<CloseGroupChainOutcome> {
    const { eligibleEnrollmentIds, skipped } = partition;

    if (eligibleEnrollmentIds.length === 0) {
      // Довести до документов некого — отчёт называет каждого и причину.
      // Пустую выгрузку не создаём: файл без строк — мусор в журнале выгрузок.
      return {
        eligible: 0,
        skipped,
        documents: null,
        registry: null,
        cached: false
      };
    }

    const documents = this.documents.closeGroup(
      tenantId,
      actorId,
      {
        groupId: request.groupId,
        protocolTemplateId: request.protocolTemplateId,
        certificateTemplateId: request.certificateTemplateId,
        enrollmentIds: eligibleEnrollmentIds
      },
      context
    );

    const registry = await this.otRegistry.exportOtRegistry(
      tenantId,
      { groupId: request.groupId, format: request.format ?? 'xlsx' },
      context
    );

    return {
      eligible: eligibleEnrollmentIds.length,
      skipped,
      documents: {
        protocolTaskId: documents.protocol.id,
        certificates: documents.certificates.length,
        created: documents.created,
        retried: documents.retried
      },
      registry: {
        batchId: registry.batchId,
        total: registry.total,
        exported: registry.exported,
        failed: registry.failed,
        errors: registry.errors
      },
      cached: false
    };
  }
}
