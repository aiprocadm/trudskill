import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  PreconditionFailedException
} from '@nestjs/common';

import {
  CONSENT_KINDS,
  type ConsentKind,
  type ConsentState,
  type LegacyConsentEvidence,
  hashConsentBody,
  legacyCovers,
  resolveConsentState
} from './consent.js';
import {
  CONSENT_REPOSITORY,
  type ConsentDocumentRow,
  type ConsentFactRow,
  type ConsentRepository
} from './consent.repository.js';
import { AuditService } from '../../audit/audit.service.js';
import { LegalLogWriter } from '../esignature/legal-log.writer.js';
import { LEARNER_FILES_REPOSITORY } from '../learners/learner-files.repository.js';

import type { RequestContext } from '../../../common/context/request-context.js';
import type { LearnerFilesRepository } from '../learners/learner-files.repository.js';

/**
 * Раздельные согласия на ПДн и на фото (ФТ-C3.2, Фаза 3 Task 6).
 *
 * Два независимых факта на слушателя. Отзыв одного не трогает другой — это и есть
 * весь смысл задачи: слушатель вправе разрешить обработку данных, но отказаться от
 * фотографии, и тогда уровень 2 (селфи + паспорт) для него недоступен ЯВНО.
 *
 * Факт согласия и его отзыв фиксируются в юридическом журнале ПЭП-контура (Task 3):
 * второй журнал согласий сделал бы «личное дело» (Task 9) недоказуемым.
 */
export interface ConsentStatus {
  learnerId: string;
  personalData: ConsentState;
  photo: ConsentState;
}

const KIND_TITLES: Record<ConsentKind, string> = {
  personal_data: 'обработку персональных данных',
  photo: 'фотографирование и обработку изображения'
};

@Injectable()
export class ConsentService {
  constructor(
    @Inject(CONSENT_REPOSITORY) private readonly repo: ConsentRepository,
    @Inject(LegalLogWriter) private readonly legalLog: LegalLogWriter,
    /* Последним и необязательным: тесты собирают сервис позиционно (см. §5.357). */
    @Optional() @Inject(AuditService) private readonly auditService?: AuditService,
    /* МГ-C5.1 (срез 12.1): скан бумажного согласия — файл из личного дела слушателя. */
    @Optional()
    @Inject(LEARNER_FILES_REPOSITORY)
    private readonly learnerFiles?: LearnerFilesRepository
  ) {}

  getDocument(tenantId: string, kind: ConsentKind): Promise<ConsentDocumentRow | null> {
    return this.repo.findCurrentDocument(tenantId, kind);
  }

  async listDocuments(tenantId: string): Promise<Record<ConsentKind, ConsentDocumentRow | null>> {
    const [personalData, photo] = await Promise.all(
      CONSENT_KINDS.map((kind) => this.repo.findCurrentDocument(tenantId, kind))
    );
    return { personal_data: personalData ?? null, photo: photo ?? null };
  }

  /**
   * Сохранение текста согласия. Новая версия создаётся ТОЛЬКО если текст реально
   * изменился: правка пробелов не должна порождать версию, под которой никто не
   * подписывался.
   */
  async saveDocument(
    tenantId: string,
    kind: ConsentKind,
    body: string,
    ctx?: RequestContext
  ): Promise<ConsentDocumentRow> {
    const trimmed = body.trim();
    if (trimmed.length < 20) {
      throw new BadRequestException({
        code: 'validation_error',
        message: 'Текст согласия слишком короткий — это юридический документ'
      });
    }
    const bodyHash = hashConsentBody(trimmed);
    const current = await this.repo.findCurrentDocument(tenantId, kind);
    if (current && current.bodyHash === bodyHash) return current;
    const saved = await this.repo.insertDocument(tenantId, kind, trimmed, bodyHash);

    /*
     * След в журнале действий (ревизия 2026-08-26, ФТ-G1).
     *
     * Текст согласия — юридический документ: под ним подписывается слушатель, и на него
     * потом ссылаются при проверке обработки персональных данных. Публикация новой версии
     * не оставляла следа вообще — по журналу нельзя было сказать, кто и когда сменил
     * формулировку, под которой люди уже подписались.
     *
     * Пишем отпечаток текста, а не сам текст: журнал не место для юридических простыней,
     * а отпечаток однозначно указывает на версию в `consent_documents`.
     */
    this.auditService?.write({
      tenantId,
      ...(ctx?.userId ? { actorId: ctx.userId } : {}),
      action: 'consents.document_published',
      entityType: 'consent_document',
      entityId: `${kind}:v${saved.version}`,
      newValues: { kind, bodyHash, length: trimmed.length },
      ...(ctx?.requestId ? { requestId: ctx.requestId } : {}),
      ...(ctx?.correlationId ? { correlationId: ctx.correlationId } : {}),
      ...(ctx?.ip ? { ip: ctx.ip } : {}),
      ...(ctx?.userAgent ? { userAgent: ctx.userAgent } : {})
    });
    return saved;
  }

  async getState(tenantId: string, learnerId: string, kind: ConsentKind): Promise<ConsentState> {
    const [document, fact] = await Promise.all([
      this.repo.findCurrentDocument(tenantId, kind),
      this.repo.findLatestFact(tenantId, learnerId, kind)
    ]);
    return resolveConsentState(kind, document, fact);
  }

  async getStatus(tenantId: string, learnerId: string): Promise<ConsentStatus> {
    const [personalData, photo] = await Promise.all([
      this.getState(tenantId, learnerId, 'personal_data'),
      this.getState(tenantId, learnerId, 'photo')
    ]);
    return { learnerId, personalData, photo };
  }

  /** Действует ли согласие прямо сейчас — то, на что смотрят запреты. */
  async hasActiveConsent(tenantId: string, learnerId: string, kind: ConsentKind): Promise<boolean> {
    const fact = await this.repo.findLatestFact(tenantId, learnerId, kind);
    return Boolean(fact && !fact.revokedAt);
  }

  /**
   * Согласие на фото обязательно для подачи селфи и паспорта. Отдельный код ошибки —
   * чтобы слушатель видел, ЧЕГО именно не хватает, а не общий «доступ запрещён».
   */
  async assertPhotoConsent(tenantId: string, learnerId: string): Promise<void> {
    if (await this.hasActiveConsent(tenantId, learnerId, 'photo')) return;
    throw new PreconditionFailedException({
      code: 'photo_consent_required',
      message:
        'Нужно согласие на фотографирование и обработку изображения — без него подтверждение личности по документу недоступно'
    });
  }

  /**
   * Ленивый перенос исторического согласия в новое хранилище фактов.
   *
   * SQL-перенос в миграции `0069` читает `learning.identity_verifications`, которую код
   * не заполняет: записи живут в JSONB-снимке состояния. Поэтому перенос переносит ноль
   * строк, и слушатель, подавший документы до разделения согласий, оказывается «без
   * согласия» — ему закрывают повторную подачу, хотя согласие он давал.
   *
   * Здесь тот же перенос выполняется в момент, когда согласие реально понадобилось, и
   * из настоящего источника правды — самой записи идентификации. Это НЕ фабрикация:
   * переносится уже зафиксированный факт, с `documentVersion = undefined`, потому что
   * текста согласия в системе тогда не существовало и приписывать ему версию нельзя.
   * После первого срабатывания факт лежит в БД, и мостик больше не нужен.
   */
  async materializeLegacyConsents(
    tenantId: string,
    learnerId: string,
    legacy: LegacyConsentEvidence | undefined
  ): Promise<void> {
    if (!legacy) return;
    for (const kind of CONSENT_KINDS) {
      if (!legacyCovers(kind, legacy)) continue;
      const existing = await this.repo.findLatestFact(tenantId, learnerId, kind);
      // Есть любой факт — новее исторического; в том числе ОТЗЫВ, который нельзя
      // молча перекрыть воскрешённым старым согласием.
      if (existing) continue;

      // documentVersion и bodyHash намеренно пусты: текста согласия тогда не
      // существовало, и приписывать ему версию значило бы сфабриковать доказательство.
      const fact = await this.repo.insertFact({
        tenantId,
        learnerId,
        kind,
        grantedAt: legacy.consentAt
      });

      await this.legalLog.write({
        tenantId,
        entityType: 'learning.learner',
        entityId: learnerId,
        eventType: `consent.${kind}_granted`,
        description: `Перенесено историческое согласие на ${KIND_TITLES[kind]}`,
        payload: { kind, legacy: true, originalConsentAt: legacy.consentAt, factId: fact.id }
      });
    }
  }

  /**
   * Оба согласия обязательны ДО загрузки снимка (ФТ-C3.2).
   *
   * Раньше здесь проверялось только согласие на фото, а согласие на обработку данных —
   * лишь на шаге подачи. Разница практическая: паспорт к тому моменту уже лежал в
   * хранилище. Фотография сама по себе персональные данные, поэтому без согласия на их
   * обработку принимать её нельзя.
   */
  async assertIdentityConsents(tenantId: string, learnerId: string): Promise<void> {
    if (!(await this.hasActiveConsent(tenantId, learnerId, 'personal_data'))) {
      throw new PreconditionFailedException({
        code: 'consent_required',
        message:
          'Нужно согласие на обработку персональных данных — без него документы не принимаются'
      });
    }
    await this.assertPhotoConsent(tenantId, learnerId);
  }

  /**
   * Выдача согласия. Повторная выдача действующего согласия — не новое доказательство,
   * а дубль: возвращаем существующий факт, чтобы «дата согласия» не сдвигалась при
   * каждом открытии экрана.
   */
  async grant(
    tenantId: string,
    learnerId: string,
    kind: ConsentKind,
    ctx: RequestContext
  ): Promise<ConsentFactRow> {
    const existing = await this.repo.findLatestFact(tenantId, learnerId, kind);
    if (existing && !existing.revokedAt) return existing;

    const document = await this.repo.findCurrentDocument(tenantId, kind);
    const fact = await this.repo.insertFact({
      tenantId,
      learnerId,
      kind,
      // Хэш ИМЕННО ТОГО текста, который человек видел на экране. Текста может не быть
      // вовсе (центр его не опубликовал) — тогда фиксируется голый факт согласия.
      ...(document ? { documentVersion: document.version, bodyHash: document.bodyHash } : {}),
      ...(ctx.ip ? { ip: ctx.ip } : {}),
      ...(ctx.userAgent ? { userAgent: ctx.userAgent } : {})
    });

    await this.legalLog.write({
      tenantId,
      ...(ctx.userId ? { actorId: ctx.userId } : {}),
      entityType: 'learning.learner',
      entityId: learnerId,
      eventType: `consent.${kind}_granted`,
      description: `Дано согласие на ${KIND_TITLES[kind]}`,
      payload: {
        kind,
        documentVersion: document?.version,
        bodyHash: document?.bodyHash,
        ip: ctx.ip,
        userAgent: ctx.userAgent
      }
    });
    return fact;
  }

  /**
   * Бумажное согласие, полученное сотрудником (МГ-C5.1, срез 12.1, РМ109–РМ111): дата подписи
   * становится датой согласия, источник — `paper`, скан — файл из личного дела слушателя.
   * Действующее согласие не дублируется; после отзыва бумагу можно отметить заново.
   */
  async markPaper(
    tenantId: string,
    learnerId: string,
    kind: ConsentKind,
    input: { signedAt: string; fileId?: string },
    ctx: RequestContext
  ): Promise<ConsentState> {
    const signedAt = paperSignedAt(input.signedAt);
    if (!signedAt) {
      throw new BadRequestException({
        code: 'consent_paper_date_invalid',
        message: 'Дата подписи согласия — в формате ГГГГ-ММ-ДД, не позже сегодняшнего дня.'
      });
    }
    if (input.fileId) {
      const file = await this.learnerFiles?.get(tenantId, learnerId, input.fileId);
      if (!file) {
        throw new NotFoundException({
          code: 'file_not_found',
          message: 'Скан не найден в личном деле этого слушателя'
        });
      }
    }
    const existing = await this.repo.findLatestFact(tenantId, learnerId, kind);
    if (existing && !existing.revokedAt) return this.getState(tenantId, learnerId, kind);

    const document = await this.repo.findCurrentDocument(tenantId, kind);
    await this.repo.insertFact({
      tenantId,
      learnerId,
      kind,
      grantedAt: signedAt,
      source: 'paper',
      ...(ctx.userId ? { actorUserId: ctx.userId } : {}),
      ...(input.fileId ? { evidenceFileId: input.fileId } : {}),
      ...(document ? { documentVersion: document.version, bodyHash: document.bodyHash } : {}),
      ...(ctx.ip ? { ip: ctx.ip } : {}),
      ...(ctx.userAgent ? { userAgent: ctx.userAgent } : {})
    });
    await this.legalLog.write({
      tenantId,
      ...(ctx.userId ? { actorId: ctx.userId } : {}),
      entityType: 'learning.learner',
      entityId: learnerId,
      eventType: `consent.${kind}_granted`,
      description: `Бумажное согласие на ${KIND_TITLES[kind]} получено — отметил сотрудник`,
      payload: {
        kind,
        source: 'paper',
        signedAt: input.signedAt,
        evidenceFileId: input.fileId,
        documentVersion: document?.version,
        bodyHash: document?.bodyHash
      }
    });
    this.auditService?.write({
      tenantId,
      ...(ctx.userId ? { actorId: ctx.userId } : {}),
      action: 'learning.consent_paper_marked',
      entityType: 'learning.learner',
      entityId: learnerId,
      newValues: {
        kind,
        signedAt: input.signedAt,
        ...(input.fileId ? { fileId: input.fileId } : {})
      },
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
      userAgent: ctx.userAgent
    });
    return this.getState(tenantId, learnerId, kind);
  }

  /**
   * Отзыв согласия. Трогает ТОЛЬКО указанный вид — отзыв фото не отзывает согласие на
   * обработку данных. Уже принятое решение модератора не отменяется: отзыв запрещает
   * НОВУЮ обработку, а не переписывает историю.
   */
  async revoke(
    tenantId: string,
    learnerId: string,
    kind: ConsentKind,
    ctx: RequestContext
  ): Promise<ConsentState> {
    const revoked = await this.repo.revokeLatestFact(
      tenantId,
      learnerId,
      kind,
      new Date().toISOString()
    );
    if (revoked) {
      await this.legalLog.write({
        tenantId,
        ...(ctx.userId ? { actorId: ctx.userId } : {}),
        entityType: 'learning.learner',
        entityId: learnerId,
        eventType: `consent.${kind}_revoked`,
        description: `Отозвано согласие на ${KIND_TITLES[kind]}`,
        payload: { kind, grantedAt: revoked.grantedAt, ip: ctx.ip, userAgent: ctx.userAgent }
      });
    }
    return this.getState(tenantId, learnerId, kind);
  }
}

/** Дата подписи бумаги: «ГГГГ-ММ-ДД», существующий день, не позже сегодняшнего; иначе `null`. */
const paperSignedAt = (raw: string): string | null => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((raw ?? '').trim());
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  if (date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
  if (date.getTime() > Date.now() + 24 * 60 * 60 * 1000) return null;
  return date.toISOString();
};
