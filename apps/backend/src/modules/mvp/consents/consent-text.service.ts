import { BadRequestException, Inject, Injectable } from '@nestjs/common';

import {
  CONSENT_TEXT_REPOSITORY,
  type ConsentTextRepository,
  type ConsentTextRow
} from './consent-text.repository.js';
import { CONSENT_KINDS, type ConsentKind } from './consent.js';
import { LegalLogWriter } from '../esignature/legal-log.writer.js';
import { hashAgreementBody } from '../esignature/simple-signature.js';

import type { RequestContext } from '../../../common/context/request-context.js';

/** Минимальная длина: согласие — юридический документ, а не подпись к чекбоксу. */
const MIN_BODY_LENGTH = 20;

/**
 * Тексты согласий и фиксация фактов (ФТ-C3.2, Фаза 3 Task 6).
 *
 * Тексты редактирует тенант; версия никогда не переписывается, рядом лежит хэш
 * нормализованного текста — тот же приём, что у соглашения ПЭП (Task 3). Хэш нужен,
 * чтобы правка пробелов НЕ заставляла всех давать согласие заново, а изменение смысла —
 * заставляла.
 *
 * Сами факты согласия и отзыва пишутся в существующий юридический журнал
 * `esign.legal_log_entries` (append-only). Второго журнала доказательств не заводим:
 * копия неизбежно разойдётся с оригиналом.
 */
@Injectable()
export class ConsentTextService {
  constructor(
    @Inject(CONSENT_TEXT_REPOSITORY) private readonly repo: ConsentTextRepository,
    @Inject(LegalLogWriter) private readonly legalLog: LegalLogWriter
  ) {}

  get(tenantId: string, kind: ConsentKind): Promise<ConsentTextRow | null> {
    return this.repo.findCurrent(tenantId, kind);
  }

  /** Оба текста разом — форма слушателя показывает их вместе. */
  async getAll(tenantId: string): Promise<Record<ConsentKind, ConsentTextRow | null>> {
    const [pii, photo] = await Promise.all([
      this.repo.findCurrent(tenantId, 'pii'),
      this.repo.findCurrent(tenantId, 'photo')
    ]);
    return { pii, photo };
  }

  /** Новая версия создаётся ТОЛЬКО если текст реально изменился. */
  async save(tenantId: string, kind: ConsentKind, body: string): Promise<ConsentTextRow> {
    if (!CONSENT_KINDS.includes(kind)) {
      throw new BadRequestException({
        code: 'validation_error',
        message: 'Неизвестный вид согласия'
      });
    }
    const trimmed = body.trim();
    if (trimmed.length < MIN_BODY_LENGTH) {
      throw new BadRequestException({
        code: 'validation_error',
        message: 'Текст согласия слишком короткий — это юридический документ'
      });
    }
    const bodyHash = hashAgreementBody(trimmed);
    const current = await this.repo.findCurrent(tenantId, kind);
    if (current && current.bodyHash === bodyHash) return current;
    return this.repo.insert(tenantId, kind, trimmed, bodyHash);
  }

  /**
   * Фиксация факта согласия в юридическом журнале.
   *
   * Записываем ЧТО (вид и хэш текста), КТО и КОГДА, ОТКУДА (IP и user-agent). Без хэша
   * запись ничего не доказывает: текст согласия редактируется тенантом и через год
   * будет другим.
   */
  async recordGranted(
    tenantId: string,
    learnerId: string,
    kind: ConsentKind,
    ctx: RequestContext
  ): Promise<void> {
    const text = await this.repo.findCurrent(tenantId, kind);
    await this.legalLog.write({
      tenantId,
      actorId: ctx.userId,
      entityType: 'learning.identity_verification',
      entityId: learnerId,
      eventType: `consent.${kind}_granted`,
      description:
        kind === 'pii'
          ? 'Согласие на обработку персональных данных'
          : 'Согласие на обработку фотографии',
      payload: {
        kind,
        ...(text ? { textVersion: text.version, bodyHash: text.bodyHash } : { textVersion: null }),
        ...(ctx.ip ? { ip: ctx.ip } : {}),
        ...(ctx.userAgent ? { userAgent: ctx.userAgent } : {})
      }
    });
  }

  /** Фиксация отзыва. Отзыв — такое же юридически значимое действие, как согласие. */
  async recordRevoked(
    tenantId: string,
    learnerId: string,
    kind: ConsentKind,
    ctx: RequestContext
  ): Promise<void> {
    await this.legalLog.write({
      tenantId,
      actorId: ctx.userId,
      entityType: 'learning.identity_verification',
      entityId: learnerId,
      eventType: `consent.${kind}_revoked`,
      description:
        kind === 'pii'
          ? 'Отзыв согласия на обработку персональных данных'
          : 'Отзыв согласия на обработку фотографии',
      payload: {
        kind,
        ...(ctx.ip ? { ip: ctx.ip } : {}),
        ...(ctx.userAgent ? { userAgent: ctx.userAgent } : {})
      }
    });
  }
}
