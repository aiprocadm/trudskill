import { Inject, Injectable, PreconditionFailedException, Scope } from '@nestjs/common';

import { partitionChainCandidates } from './close-group-chain.js';
import { MVP_STATE } from './infrastructure/mvp-state.token.js';
import { MvpService } from './mvp.service.js';
import { OtRegistryService } from './ot-registry/ot-registry.service.js';
import { AuditService } from '../audit/audit.service.js';
import { DocumentsService } from '../documents/documents.service.js';

import type { ChainSkippedEnrollment } from './close-group-chain.js';
import type { InMemoryMvpState } from './infrastructure/in-memory-mvp.state.js';
import type { CloseGroupChainOutcome, CloseGroupsBulkOutcome } from './mvp.types.js';
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
/**
 * Причина отказа человеческим языком.
 *
 * Цепочка бросает `PreconditionFailedException` с перечнем проблем уровня группы («программе
 * не назначена аттестационная комиссия»). В пачке это не ошибка запроса, а строка отчёта:
 * без такого разбора человек увидел бы «Ошибка 412» и не понял, что чинить.
 */
const describeGroupFailure = (error: unknown): string => {
  const payload = (error as { response?: unknown })?.response;
  if (payload !== null && typeof payload === 'object') {
    const body = payload as { message?: string; issues?: Array<{ message?: string }> };
    const issues = (body.issues ?? []).map((i) => i.message).filter(Boolean);
    if (issues.length > 0) return issues.join('; ');
    if (body.message) return body.message;
  }
  return error instanceof Error ? error.message : 'Не удалось закрыть группу';
};

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

  /**
   * Массовое закрытие групп (вопрос №13, решение 08.09.2026).
   *
   * Почему пачкой. Закрытие группы — работа конца месяца, и групп там десятки. Реестр групп
   * умел выделять строки ещё с волны 4, но чекбоксы были ВЫКЛЮЧЕНЫ намеренно: за ними не
   * стояло серверной операции, а галочки без действия — обман интерфейса.
   *
   * Почему поверх цепочки, а не поверх «закрыть группу». Цепочка сама отбирает сдавших и
   * отчитывается по отсеянным поимённо; «закрыть группу» требует передать список зачислений,
   * то есть человек должен был бы выбрать людей в каждой из сорока групп руками.
   *
   * Частичный успех. Группа без комиссии, без курса или с двумя курсами не отменяет
   * остальные — она возвращается строкой с причиной. Иначе одна неготовая группа означала бы
   * работу заново для всех сорока.
   */
  async runChainBulk(
    tenantId: string,
    actorId: string | undefined,
    request: {
      groupIds: string[];
      protocolTemplateId: string;
      certificateTemplateId: string;
      idempotencyKey: string;
      format?: 'xlsx' | 'xml';
    },
    context: RequestContext
  ): Promise<CloseGroupsBulkOutcome> {
    const rows: CloseGroupsBulkOutcome['rows'] = [];
    /* Дубли в выделении — обычное дело; закрывать одну группу дважды незачем. */
    const groupIds = [...new Set(request.groupIds.map((id) => id.trim()).filter(Boolean))];

    for (const groupId of groupIds) {
      const group = this.state.groups.find((g) => g.tenantId === tenantId && g.id === groupId);
      if (!group) {
        rows.push({
          groupId,
          groupName: groupId,
          status: 'skipped',
          reason: 'Группы нет в этом учебном центре'
        });
        continue;
      }

      const courses = this.state.groupCourses.filter(
        (gc) => gc.tenantId === tenantId && gc.groupId === groupId
      );
      if (courses.length === 0) {
        rows.push({
          groupId,
          groupName: group.name,
          status: 'skipped',
          reason: 'Группе не назначен курс — назначьте программу и повторите'
        });
        continue;
      }
      if (courses.length > 1) {
        /* Выбрать за человека, какой из курсов закрывать, нельзя: документы разные. */
        rows.push({
          groupId,
          groupName: group.name,
          status: 'skipped',
          reason: 'В группе несколько курсов — закройте её отдельно, чтобы выбрать нужный'
        });
        continue;
      }

      try {
        const outcome = await this.runChain(
          tenantId,
          actorId,
          {
            groupId,
            courseId: courses[0]!.courseId,
            protocolTemplateId: request.protocolTemplateId,
            certificateTemplateId: request.certificateTemplateId,
            /*
             * Ключ группы выводится из общего — так повтор всей пачки не выпускает второй
             * комплект документов ни одной группе (соглашение CLAUDE.md о под-ключах).
             */
            idempotencyKey: `${request.idempotencyKey}::${groupId}`,
            ...(request.format ? { format: request.format } : {})
          },
          context
        );
        rows.push({
          groupId,
          groupName: group.name,
          status: 'closed',
          issued: outcome.documents?.certificates ?? 0,
          ...(outcome.skipped.length > 0
            ? {
                skippedLearners: outcome.skipped.map((s) => ({
                  fullName: s.fullName,
                  message: s.message
                }))
              }
            : {})
        });
      } catch (error) {
        rows.push({
          groupId,
          groupName: group.name,
          status: 'skipped',
          reason: describeGroupFailure(error)
        });
      }
    }

    return {
      total: rows.length,
      closed: rows.filter((r) => r.status === 'closed').length,
      skipped: rows.filter((r) => r.status === 'skipped').length,
      rows
    };
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
