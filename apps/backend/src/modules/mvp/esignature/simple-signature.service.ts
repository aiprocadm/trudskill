import { BadRequestException, Inject, Injectable } from '@nestjs/common';

import { LegalLogWriter } from './legal-log.writer.js';
import { hashAgreementBody, needsAcceptance } from './simple-signature.js';
import {
  type AcceptanceRow,
  type AgreementRow,
  SIMPLE_SIGNATURE_REPOSITORY,
  type SimpleSignatureRepository
} from './simple-signature.repository.js';

import type { RequestContext } from '../../../common/context/request-context.js';

/**
 * Простая электронная подпись (ФТ-C1.1, Фаза 3 Task 3).
 *
 * Уровень 1 политики идентификации означает: слушатель при первом входе подписывает
 * «Соглашение об электронном взаимодействии», и после этого его клики «Ознакомлен»,
 * ответы на тесты и заявления считаются подписанными ПЭП.
 *
 * Доказательство складывается из трёх частей: ЧТО подписано (хэш текста), КТО и КОГДА
 * (пользователь и момент), ОТКУДА (IP и user-agent). Без хэша текста подпись ничего не
 * доказывает: текст соглашения редактируется тенантом и через год будет другим.
 */
export interface SignatureStatus {
  hasAgreement: boolean;
  agreementVersion?: number;
  acceptedAt?: string;
  /** Нужно показать экран принятия: соглашение есть, а принятого текста нет либо он устарел. */
  acceptanceRequired: boolean;
}

@Injectable()
export class SimpleSignatureService {
  constructor(
    @Inject(SIMPLE_SIGNATURE_REPOSITORY) private readonly repo: SimpleSignatureRepository,
    @Inject(LegalLogWriter) private readonly legalLog: LegalLogWriter
  ) {}

  getAgreement(tenantId: string): Promise<AgreementRow | null> {
    return this.repo.findCurrentAgreement(tenantId);
  }

  /**
   * Сохранение текста соглашения. Новая версия создаётся ТОЛЬКО если текст реально
   * изменился: правка пробелов не должна гнать всех слушателей принимать заново.
   */
  async saveAgreement(tenantId: string, body: string): Promise<AgreementRow> {
    const trimmed = body.trim();
    if (trimmed.length < 20) {
      throw new BadRequestException({
        code: 'validation_error',
        message: 'Текст соглашения слишком короткий — это юридический документ'
      });
    }
    const bodyHash = hashAgreementBody(trimmed);
    const current = await this.repo.findCurrentAgreement(tenantId);
    if (current && current.bodyHash === bodyHash) return current;
    return this.repo.insertAgreement(tenantId, trimmed, bodyHash);
  }

  async getStatus(tenantId: string, userId: string): Promise<SignatureStatus> {
    const [agreement, acceptance] = await Promise.all([
      this.repo.findCurrentAgreement(tenantId),
      this.repo.findLatestAcceptance(tenantId, userId)
    ]);
    return {
      hasAgreement: Boolean(agreement),
      ...(agreement ? { agreementVersion: agreement.version } : {}),
      ...(acceptance && agreement && acceptance.bodyHash === agreement.bodyHash
        ? { acceptedAt: acceptance.acceptedAt }
        : {}),
      acceptanceRequired: needsAcceptance(agreement, acceptance)
    };
  }

  /**
   * Принятие соглашения. Фиксируется хэш ИМЕННО ТОГО текста, который пользователь видел,
   * плюс IP и user-agent из контекста запроса.
   */
  async accept(tenantId: string, userId: string, ctx: RequestContext): Promise<AcceptanceRow> {
    const agreement = await this.repo.findCurrentAgreement(tenantId);
    if (!agreement) {
      throw new BadRequestException({
        code: 'domain_rule_violation',
        message: 'Учебный центр не опубликовал соглашение об электронном взаимодействии'
      });
    }
    const acceptance = await this.repo.insertAcceptance({
      tenantId,
      userId,
      agreementVersion: agreement.version,
      bodyHash: agreement.bodyHash,
      ...(ctx.ip ? { ip: ctx.ip } : {}),
      ...(ctx.userAgent ? { userAgent: ctx.userAgent } : {})
    });

    await this.legalLog.write({
      tenantId,
      actorId: userId,
      entityType: 'iam.user',
      entityId: userId,
      eventType: 'esignature.agreement_accepted',
      description: `Принято соглашение об электронном взаимодействии, версия ${agreement.version}`,
      payload: {
        agreementVersion: agreement.version,
        bodyHash: agreement.bodyHash,
        ip: ctx.ip,
        userAgent: ctx.userAgent
      }
    });
    return acceptance;
  }

  /**
   * Подпись действия ПЭП. Возвращает `false`, если соглашение не принято, — вызывающий
   * код сам решает, блокировать действие или просто не считать его подписанным.
   * Молча «подписывать» без принятого соглашения нельзя: это подделка доказательства.
   */
  async signAction(
    tenantId: string,
    userId: string,
    action: { entityType: string; entityId: string; eventType: string; description: string },
    ctx: RequestContext
  ): Promise<boolean> {
    const status = await this.getStatus(tenantId, userId);
    if (!status.hasAgreement || status.acceptanceRequired) return false;

    await this.legalLog.write({
      tenantId,
      actorId: userId,
      entityType: action.entityType,
      entityId: action.entityId,
      eventType: action.eventType,
      description: action.description,
      payload: {
        signedWith: 'simple_electronic_signature',
        agreementVersion: status.agreementVersion,
        ip: ctx.ip,
        userAgent: ctx.userAgent
      }
    });
    return true;
  }
}
