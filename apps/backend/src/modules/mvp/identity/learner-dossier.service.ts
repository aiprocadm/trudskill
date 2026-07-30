import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { convertHtmlToPdf } from '@trudskill/docx-render';

import { renderDossierHtml } from './learner-dossier.html.js';
import {
  type DossierDocument,
  type DossierExamSession,
  type DossierIdentitySection,
  type LearnerDossier,
  examDurationMinutes,
  resolveReviewerLabel,
  toSignedAction
} from './learner-dossier.js';
import { AuditService } from '../../audit/audit.service.js';
import { DocumentsService } from '../../documents/documents.service.js';
import { LegalLogReader } from '../esignature/legal-log.reader.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';
import { MVP_STATE } from '../infrastructure/mvp-state.token.js';

import type { RequestContext } from '../../../common/context/request-context.js';
import type { GeneratedDocumentEntity } from '../../documents/documents.types.js';

/** Поиск ФИО пользователя IAM; подставляется снаружи, чтобы не тянуть IamService в тесты. */
export type DossierUserLookup = (actorId: string) => Promise<string | undefined>;

/**
 * «Личное дело слушателя» (ФТ-C2, Фаза 3 Task 9).
 *
 * Собирает четыре раздела из СУЩЕСТВУЮЩИХ источников — своей таблицы нет намеренно:
 * копия доказательств разошлась бы с оригиналом.
 *
 * Защита — та же, что у карточки слушателя: чужой тенант получает 404 (не 403, чтобы
 * не подтверждать существование записи), а каждое обращение пишется в 152-ФЗ access-log
 * БЕЗ персональных данных в теле записи.
 */
@Injectable()
export class LearnerDossierService {
  constructor(
    @Inject(MVP_STATE) private readonly state: InMemoryMvpState,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(DocumentsService) private readonly documentsService: DocumentsService,
    @Inject(LegalLogReader) private readonly legalLog: LegalLogReader
  ) {}

  async compose(
    tenantId: string,
    actorId: string | undefined,
    learnerId: string,
    ctx: RequestContext,
    userLookup: DossierUserLookup = async () => undefined
  ): Promise<LearnerDossier> {
    const learner = this.state.learners.find((l) => l.tenantId === tenantId && l.id === learnerId);
    if (!learner) {
      throw new NotFoundException({ code: 'learner_not_found', message: 'Ученик не найден' });
    }

    // 152-ФЗ access-log: только идентификатор, никаких ФИО/СНИЛС в теле записи.
    await this.auditService.writeCritical({
      tenantId,
      actorId,
      action: 'learner.personal_data_accessed',
      entityType: 'mvp.learner',
      entityId: learnerId,
      newValues: { accessedVia: 'learner_dossier' },
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
      userAgent: ctx.userAgent
    });

    const unavailableSections: string[] = [];

    return {
      learner: {
        id: learner.id,
        fullName: [learner.lastName, learner.firstName, learner.middleName]
          .filter(Boolean)
          .join(' '),
        ...(learner.snils ? { snils: learner.snils } : {}),
        ...(learner.dateOfBirth ? { dateOfBirth: learner.dateOfBirth } : {}),
        ...(learner.position ? { position: learner.position } : {})
      },
      identity: await this.composeIdentity(tenantId, learnerId, userLookup),
      exams: this.composeExams(tenantId, learnerId),
      documents: this.composeDocuments(tenantId, learnerId),
      signedActions: await this.composeSignedActions(tenantId, learner.linkedIamUserId, () =>
        unavailableSections.push('signedActions')
      ),
      unavailableSections,
      generatedAt: new Date().toISOString()
    };
  }

  /** Последняя по времени запись идентификации: она и отражает текущее состояние. */
  private async composeIdentity(
    tenantId: string,
    learnerId: string,
    userLookup: DossierUserLookup
  ): Promise<DossierIdentitySection> {
    const records = this.state.identityVerifications
      .filter((v) => v.tenantId === tenantId && v.learnerId === learnerId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const record = records[0];
    if (!record) return { status: 'none' };

    const reviewedBy = await resolveReviewerLabel(record.reviewedByActorId, userLookup);
    return {
      status: record.verificationStatus,
      method: record.method,
      ...(record.submittedAt ? { submittedAt: record.submittedAt } : {}),
      ...(record.reviewedAt ? { reviewedAt: record.reviewedAt } : {}),
      ...(reviewedBy ? { reviewedBy } : {}),
      ...(record.rejectionReason ? { rejectionReason: record.rejectionReason } : {}),
      // Снимки могли уйти по сроку хранения — решение при этом осталось, и об этом
      // надо сказать явно, иначе проверяющий решит, что документов не было вовсе.
      ...(record.imagesPurgedAt ? { imagesPurgedAt: record.imagesPurgedAt } : {})
    };
  }

  private composeExams(tenantId: string, learnerId: string): DossierExamSession[] {
    return this.state.attempts
      .filter((a) => a.tenantId === tenantId && a.learnerId === learnerId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .map((attempt) => {
        const test = this.state.tests.find(
          (t) => t.tenantId === tenantId && t.id === attempt.testId
        );
        const finishedAt = attempt.finishedAt ?? attempt.submittedAt;
        const duration = examDurationMinutes(attempt.startedAt, finishedAt);
        return {
          attemptId: attempt.id,
          testTitle: test?.title ?? attempt.testId,
          startedAt: attempt.startedAt,
          ...(finishedAt ? { finishedAt } : {}),
          ...(duration === undefined ? {} : { durationMinutes: duration }),
          ...(attempt.score === undefined ? {} : { score: attempt.score }),
          ...(attempt.maxScore === undefined ? {} : { maxScore: attempt.maxScore }),
          ...(attempt.passed === undefined ? {} : { passed: attempt.passed }),
          ...(attempt.identityVerifiedAt ? { identityVerifiedAt: attempt.identityVerifiedAt } : {})
        };
      });
  }

  /** Документы связаны со слушателем через его зачисления — как в карточке слушателя. */
  private composeDocuments(tenantId: string, learnerId: string): DossierDocument[] {
    const enrollmentIds = new Set(
      this.state.enrollments
        .filter((e) => e.tenantId === tenantId && e.learnerId === learnerId)
        .map((e) => e.id)
    );
    return this.documentsService
      .listDocuments(tenantId, { sourceEntityType: 'enrollment' })
      .items.filter((d: GeneratedDocumentEntity) =>
        d.sourceEntityId ? enrollmentIds.has(d.sourceEntityId) : false
      )
      .map((d: GeneratedDocumentEntity) => ({
        id: d.id,
        documentType: d.documentType,
        ...(d.documentNumber ? { documentNumber: d.documentNumber } : {}),
        ...(d.documentDate ? { documentDate: d.documentDate } : {}),
        status: d.status,
        // Отозванный документ остаётся в деле: скрыть отзыв значило бы показать
        // проверяющему действующим то, что действующим не является.
        ...(d.revokedAt ? { revokedAt: d.revokedAt } : {})
      }));
  }

  private async composeSignedActions(
    tenantId: string,
    linkedIamUserId: string | undefined,
    markUnavailable: () => void
  ) {
    // Подписи привязаны к пользователю IAM, а не к карточке слушателя: непривязанный
    // профиль ничего подписать не мог — это пустой раздел, а не сбой.
    if (!linkedIamUserId) return [];
    try {
      const entries = await this.legalLog.listByActor(tenantId, linkedIamUserId);
      return entries.map(toSignedAction);
    } catch {
      // Недоступный журнал не обрушает всё дело: остальные разделы полезны. Но раздел
      // помечается непрочитанным — пустой список означал бы «подписей не было».
      markUnavailable();
      return [];
    }
  }

  /**
   * Дело одним PDF (ФТ-C2) — то, что физически отдают проверяющему.
   *
   * Рендер синхронный, а не через очередь документов: дело собирается из уже готовых
   * данных и нужно «здесь и сейчас», в отличие от удостоверений, которые печатаются
   * пачками и терпят ожидание.
   */
  async composePdf(
    tenantId: string,
    actorId: string | undefined,
    learnerId: string,
    ctx: RequestContext,
    deps: { gotenbergUrl: string; convert: typeof convertHtmlToPdf },
    userLookup?: DossierUserLookup
  ): Promise<{ pdf: Buffer; fileName: string }> {
    const dossier = await this.compose(tenantId, actorId, learnerId, ctx, userLookup);
    const pdf = await deps.convert(renderDossierHtml(dossier), {
      gotenbergUrl: deps.gotenbergUrl
    });
    // Имя файла — из идентификатора, а не из ФИО: ПДн не должны утекать в имена файлов,
    // логи прокси и историю загрузок браузера.
    return { pdf, fileName: `dossier-${learnerId}.pdf` };
  }
}
