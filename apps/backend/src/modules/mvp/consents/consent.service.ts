import { BadRequestException, Inject, Injectable, PreconditionFailedException } from '@nestjs/common';

import {
  CONSENT_KINDS,
  type ConsentKind,
  type ConsentState,
  hashConsentBody,
  resolveConsentState
} from './consent.js';
import {
  CONSENT_REPOSITORY,
  type ConsentDocumentRow,
  type ConsentFactRow,
  type ConsentRepository
} from './consent.repository.js';
import { LegalLogWriter } from '../esignature/legal-log.writer.js';

import type { RequestContext } from '../../../common/context/request-context.js';

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
    @Inject(LegalLogWriter) private readonly legalLog: LegalLogWriter
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
  async saveDocument(tenantId: string, kind: ConsentKind, body: string): Promise<ConsentDocumentRow> {
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
    return this.repo.insertDocument(tenantId, kind, trimmed, bodyHash);
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
  async hasActiveConsent(
    tenantId: string,
    learnerId: string,
    kind: ConsentKind
  ): Promise<boolean> {
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
