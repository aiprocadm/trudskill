import { Inject, Injectable, NotFoundException } from '@nestjs/common';

import {
  type ErasureReport,
  type LearnerLike,
  eraseLearnerCard,
  retentionNotice
} from './learner-pii.util.js';
import { AuditService } from '../../audit/audit.service.js';
import { DocumentsService } from '../../documents/documents.service.js';
import { InMemoryMvpState } from '../infrastructure/in-memory-mvp.state.js';
import { MVP_STATE } from '../infrastructure/mvp-state.token.js';
import { piiAccessMetadata } from '../pii-masking.js';

import type { RequestContext } from '../../../common/context/request-context.js';
import type { GeneratedDocumentEntity } from '../../documents/documents.types.js';

/**
 * ФТ-G6 (Фаза 4 Task 12): права субъекта персональных данных — 152-ФЗ.
 *
 * Две операции, которые центр обязан уметь выполнять по заявлению слушателя:
 *   1) выгрузка всех его ПДн в машиночитаемом виде (ст. 14);
 *   2) прекращение обработки по отзыву согласия (ст. 9 ч. 2).
 *
 * **Чем это отличается от «личного дела» (ФТ-C2).** Дело — это PDF для проверяющего:
 * сведённые воедино доказательства обучения, человекочитаемые. Здесь наоборот — JSON
 * для самого слушателя, куда попадают ВСЕ поля, включая те, которые в дело не входят
 * (телефон, e-mail, слепой индекс СНИЛС, привязка к учётной записи). Закон даёт право
 * на данные, а не на красивый отчёт, и выгрузка должна быть пригодна для переноса.
 *
 * **Почему обезличивание, а не удаление** — см. `learner-pii.util.ts`. Коротко: документы
 * об обучении обрабатываются по обязанности закона, а не по согласию, поэтому отзыв
 * согласия их не отменяет.
 */
@Injectable()
export class LearnerPiiService {
  constructor(
    @Inject(MVP_STATE) private readonly state: InMemoryMvpState,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(DocumentsService) private readonly documentsService: DocumentsService
  ) {}

  /**
   * Показать персональные данные ЦЕЛИКОМ — по явному действию человека (ТЗ 17.2).
   *
   * В списках номера показаны частично: список слушателей открыт менеджеру, который ведёт
   * клиентов, и преподавателю, который ведёт группу, — им нужно узнать человека в строке, а не
   * его номер в пенсионном фонде. Полный номер виден только тому, кто нажал «Показать
   * полностью», и каждое такое нажатие попадает в журнал доступа (журнал 577).
   *
   * **Почему запись в журнал обязательна.** Ровно это спрашивают при проверке: кто и когда
   * видел персональные данные. Просмотр, не оставляющий следа, невозможно ни подтвердить, ни
   * опровергнуть.
   *
   * **Почему запрашивается причина.** Не ради формальности: необходимость назвать причину сама
   * по себе останавливает праздный просмотр «а что там у этого», и она же помогает разобраться
   * потом, когда вспомнить обстоятельства уже нельзя.
   */
  async revealPersonalData(
    tenantId: string,
    actorId: string | undefined,
    learnerId: string,
    reason: string | undefined,
    context: RequestContext
  ): Promise<{ snils?: string; passport?: unknown; birthDate?: string }> {
    const learner = this.requireLearner(tenantId, learnerId) as LearnerLike & {
      snils?: string;
      passport?: unknown;
      birthDate?: string;
      dateOfBirth?: string;
    };

    await this.auditService.writeCritical({
      tenantId,
      actorId,
      action: 'learners.pii_revealed',
      entityType: 'learning.learner',
      entityId: learnerId,
      metadata: piiAccessMetadata({
        action: 'pii.revealed',
        learnerId,
        fields: ['snils', 'passport', 'birthDate'],
        ...(reason ? { reason } : {})
      }),
      requestId: context.requestId,
      correlationId: context.correlationId,
      ip: context.ip,
      userAgent: context.userAgent
    });

    return {
      ...(learner.snils ? { snils: learner.snils } : {}),
      ...(learner.passport ? { passport: learner.passport } : {}),
      /* Поле карточки — `dateOfBirth`; `birthDate` — прежнее имя в ответе (РМ78). */
      ...((learner.dateOfBirth ?? learner.birthDate)
        ? { birthDate: (learner.dateOfBirth ?? learner.birthDate) as string }
        : {})
    };
  }

  /**
   * Полная выгрузка ПДн слушателя.
   *
   * Отдаётся ровно то, что хранится, без «причёсывания»: если в карточке пустой отчеству —
   * так и будет видно. Смысл права на доступ в том, чтобы человек увидел свои данные
   * такими, какие они есть, и мог потребовать исправления.
   */
  async exportPersonalData(
    tenantId: string,
    actorId: string | undefined,
    learnerId: string,
    ctx: RequestContext
  ) {
    const learner = this.requireLearner(tenantId, learnerId);

    // Сам факт выгрузки — тоже событие для журнала 152-ФЗ. В теле записи только
    // идентификатор: иначе журнал доступа сам стал бы копией персональных данных.
    await this.auditService.writeCritical({
      tenantId,
      actorId,
      action: 'learner.personal_data_exported',
      entityType: 'mvp.learner',
      entityId: learnerId,
      newValues: { exportedVia: 'subject_access_request' },
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
      userAgent: ctx.userAgent
    });

    const enrollmentIds = this.enrollmentIds(tenantId, learnerId);

    return {
      subject: {
        learnerId: learner.id,
        learnerNo: learner.learnerNo,
        firstName: learner.firstName,
        lastName: learner.lastName,
        middleName: learner.middleName,
        dateOfBirth: learner.dateOfBirth,
        snils: learner.snils,
        email: learner.email,
        phone: learner.phone,
        position: learner.position,
        /* Личное дело (МГ-C1.1): выгрузка по запросу субъекта отдаёт всё, что о нём хранится. */
        passport: learner.passport,
        gender: learner.gender,
        birthPlace: learner.birthPlace,
        citizenship: learner.citizenship,
        registrationAddress: learner.registrationAddress,
        educationLevel: learner.educationLevel,
        diploma: learner.diploma,
        extraFields: learner.extraFields,
        status: learner.status,
        createdAt: learner.createdAt,
        updatedAt: learner.updatedAt,
        // Привязка к учётной записи — тоже сведение о человеке: через неё его действия
        // связываются с журналом подписей.
        linkedIamUserId: learner.linkedIamUserId
      },
      enrollments: this.state.enrollments
        .filter((e) => e.tenantId === tenantId && e.learnerId === learnerId)
        // Курса у зачисления нет: слушателя зачисляют в ГРУППУ, а курсы висят на ней.
        .map((e) => ({
          id: e.id,
          groupId: e.groupId,
          status: e.status,
          enrolledAt: e.enrolledAt,
          completedAt: e.completedAt,
          createdAt: e.createdAt
        })),
      examAttempts: this.state.attempts
        .filter((a) => a.tenantId === tenantId && a.learnerId === learnerId)
        .map((a) => ({
          id: a.id,
          testId: a.testId,
          startedAt: a.startedAt,
          finishedAt: a.finishedAt,
          score: a.score,
          maxScore: a.maxScore,
          passed: a.passed
        })),
      documents: this.documentsService
        .listDocuments(tenantId, { sourceEntityType: 'enrollment' })
        .items.filter((d: GeneratedDocumentEntity) =>
          d.sourceEntityId ? enrollmentIds.has(d.sourceEntityId) : false
        )
        .map((d: GeneratedDocumentEntity) => ({
          id: d.id,
          documentType: d.documentType,
          documentNumber: d.documentNumber,
          documentDate: d.documentDate,
          status: d.status,
          revokedAt: d.revokedAt
        })),
      // Снимки лица и паспорта НЕ вкладываются в выгрузку: отдать их по HTTP означало бы
      // создать ещё одну копию биометрии там, где её раньше не было. Отдаём метаданные —
      // человек видит, что и когда с ним делали, и может запросить сами файлы отдельно.
      identityVerifications: this.state.identityVerifications
        .filter((v) => v.tenantId === tenantId && v.learnerId === learnerId)
        .map((v) => ({
          id: v.id,
          method: v.method,
          verificationStatus: v.verificationStatus,
          consentAt: v.consentAt,
          photoConsentAt: v.photoConsentAt,
          submittedAt: v.submittedAt,
          reviewedAt: v.reviewedAt,
          rejectionReason: v.rejectionReason,
          imagesPurgedAt: v.imagesPurgedAt,
          hasStoredImages: Boolean(v.selfieFileId ?? v.passportFileId)
        })),
      proctoringSessions: this.state.proctoringRecordings
        .filter((r) => r.tenantId === tenantId && r.learnerId === learnerId)
        .map((r) => ({
          id: r.id,
          courseId: r.courseId,
          consentAt: r.consentAt,
          startedAt: r.startedAt,
          completedAt: r.completedAt,
          chunkCount: r.chunks.length,
          purgedAt: r.purgedAt
        })),
      generatedAt: new Date().toISOString(),
      format: 'application/json',
      legalBasis: '152-ФЗ ст. 14 — право субъекта на доступ к своим персональным данным'
    };
  }

  /**
   * Прекращение обработки по отзыву согласия: карточка обезличивается, документы остаются.
   *
   * Операция необратима и выполняется целиком: если бы часть полей стёрлась, а часть нет,
   * человека всё равно можно было бы опознать — то есть требование закона не выполнено,
   * а данные уже испорчены. Поэтому сначала собирается полная картина, потом одна запись.
   */
  async erasePersonalData(
    tenantId: string,
    actorId: string | undefined,
    learnerId: string,
    ctx: RequestContext,
    reason?: string
  ): Promise<ErasureReport> {
    const learner = this.requireLearner(tenantId, learnerId);

    const enrollmentIds = this.enrollmentIds(tenantId, learnerId);
    const documentCount = this.documentsService
      .listDocuments(tenantId, { sourceEntityType: 'enrollment' })
      .items.filter((d: GeneratedDocumentEntity) =>
        d.sourceEntityId ? enrollmentIds.has(d.sourceEntityId) : false
      ).length;

    const { learner: erased, erasedFields } = eraseLearnerCard(learner as LearnerLike);
    Object.assign(learner, erased, { updatedAt: new Date().toISOString() });

    // Биометрия отзывается вместе с карточкой, не дожидаясь срока хранения: снимок лица
    // опознаёт человека сам по себе, и оставлять его после отзыва согласия нельзя.
    const purgedAt = new Date().toISOString();
    let identityImagesPurged = 0;
    for (const record of this.state.identityVerifications) {
      if (record.tenantId !== tenantId || record.learnerId !== learnerId) continue;
      if (!record.selfieFileId && !record.passportFileId) continue;
      record.selfieFileId = undefined;
      record.passportFileId = undefined;
      record.imagesPurgedAt = record.imagesPurgedAt ?? purgedAt;
      identityImagesPurged += 1;
    }
    for (const recording of this.state.proctoringRecordings) {
      if (recording.tenantId !== tenantId || recording.learnerId !== learnerId) continue;
      if (recording.chunks.length === 0) continue;
      recording.chunks = [];
      recording.purgedAt = recording.purgedAt ?? purgedAt;
      identityImagesPurged += 1;
    }

    const report: ErasureReport = {
      learnerId,
      erasedFields,
      retained: retentionNotice({ enrollments: enrollmentIds.size, documents: documentCount }),
      identityImagesPurged
    };

    // Запись об обезличивании обязана пережить само обезличивание: именно ею центр
    // доказывает, что требование субъекта выполнено и когда.
    await this.auditService.writeCritical({
      tenantId,
      actorId,
      action: 'learner.personal_data_erased',
      entityType: 'mvp.learner',
      entityId: learnerId,
      // Перечисляем ИМЕНА полей, но не значения: иначе стёртые ПДн осели бы в журнале.
      newValues: {
        erasedFields,
        identityImagesPurged,
        retainedDocuments: documentCount,
        ...(reason ? { reason } : {})
      },
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
      userAgent: ctx.userAgent
    });

    return report;
  }

  /** Чужой тенант получает 404, а не 403: 403 подтвердил бы, что слушатель существует. */
  private requireLearner(tenantId: string, learnerId: string) {
    const learner = this.state.learners.find((l) => l.tenantId === tenantId && l.id === learnerId);
    if (!learner) {
      throw new NotFoundException({ code: 'learner_not_found', message: 'Слушатель не найден' });
    }
    return learner;
  }

  private enrollmentIds(tenantId: string, learnerId: string): Set<string> {
    return new Set(
      this.state.enrollments
        .filter((e) => e.tenantId === tenantId && e.learnerId === learnerId)
        .map((e) => e.id)
    );
  }
}
