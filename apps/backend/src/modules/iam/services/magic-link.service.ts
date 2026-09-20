import { createHash, randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import {
  DEFAULT_RECOVERY_THROTTLE,
  type RecoveryThrottlePolicy,
  recoveryAllowed,
  recoveryWindowStart
} from '../recovery-throttle.js';

export interface MagicLinkTokenRecord {
  tenantId: string;
  email: string;
  tokenHash: string;
  expiresAt: Date;
  requestIp?: string;
  requestUserAgent?: string;
}

export interface PersistedMagicLinkToken extends MagicLinkTokenRecord {
  id: string;
  consumedAt: Date | null;
}

export interface MagicLinkTokenRepo {
  save(record: MagicLinkTokenRecord): Promise<void>;
  /**
   * Сколько ссылок запрошено на ЭТОТ адрес начиная с момента `since` (ТЗ 17.1).
   *
   * Считаются именно запросы, а не выданные сессии: смысл предела — защитить почтовый ящик
   * человека от заваливания, а заваливают его запросами.
   */
  countRequestsSince(tenantId: string, email: string, since: Date): Promise<number>;
  findByHash(tenantId: string, tokenHash: string): Promise<PersistedMagicLinkToken | null>;
  /**
   * Atomically consume the token. Returns `true` only if THIS call flipped
   * `consumedAt` from null (i.e. the conditional update affected a row); `false` if
   * the token was already consumed by a concurrent request. Callers MUST treat a
   * `false` result as "already redeemed" — this is the single-use race gate.
   */
  markConsumed(
    tenantId: string,
    id: string,
    redeemedUserId: string,
    redeemIp?: string,
    redeemUserAgent?: string
  ): Promise<boolean>;
}

export interface MagicLinkServiceConfig {
  ttlMs: number;
}

export interface RequestLinkInput {
  /**
   * Предел восстановления центра (ТЗ 17.1). Разрешается снаружи: настройки лежат в отдельной
   * таблице. Не передан — действуют умолчания.
   */
  throttle?: RecoveryThrottlePolicy;
  tenantId: string;
  email: string;
  ip?: string;
  userAgent?: string;
}

export interface RedeemLinkInput {
  tenantId: string;
  rawToken: string;
  userId: string;
  ip?: string;
  userAgent?: string;
}

export interface PeekEmailInput {
  tenantId: string;
  rawToken: string;
}

export const MAGIC_LINK_TOKEN_REPO = 'MAGIC_LINK_TOKEN_REPO';
export const MAGIC_LINK_SERVICE_CONFIG = 'MAGIC_LINK_SERVICE_CONFIG';

export class MagicLinkInvalidError extends Error {
  constructor(public readonly reason: 'unknown' | 'expired' | 'consumed') {
    super(`Magic link ${reason}`);
    this.name = 'MagicLinkInvalidError';
  }
}

@Injectable()
export class MagicLinkService {
  constructor(
    @Inject(MAGIC_LINK_TOKEN_REPO)
    private readonly repo: MagicLinkTokenRepo,
    @Inject(MAGIC_LINK_SERVICE_CONFIG)
    private readonly config: MagicLinkServiceConfig
  ) {}

  /**
   * Запросить ссылку для входа.
   *
   * `rawToken` может вернуться пустым: значит предел восстановления сработал и письмо слать
   * НЕ нужно (ТЗ 17.1). Наружу при этом уходит тот же ответ, что и при успехе — иначе форма
   * превращается в способ проверять, есть ли такой человек в системе.
   */
  async requestLink(input: RequestLinkInput): Promise<{ rawToken: string | null }> {
    const policy = input.throttle ?? DEFAULT_RECOVERY_THROTTLE;
    const email = input.email.toLowerCase().trim();
    const recent = await this.repo.countRequestsSince(
      input.tenantId,
      email,
      recoveryWindowStart(new Date(), policy)
    );
    if (!recoveryAllowed(recent, policy)) {
      /*
       * Ни письма, ни записи токена. Записать токен и не отправить письмо было бы хуже
       * бесполезного: предел перестал бы считаться правильно — каждая попытка добавляла бы
       * запись и продлевала бы наказание.
       */
      return { rawToken: null };
    }
    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(rawToken);
    const now = new Date();
    await this.repo.save({
      tenantId: input.tenantId,
      email,
      tokenHash,
      expiresAt: new Date(now.getTime() + this.config.ttlMs),
      requestIp: input.ip,
      requestUserAgent: input.userAgent
    });
    return { rawToken };
  }

  async peekEmail(input: PeekEmailInput): Promise<{ email: string }> {
    const record = await this.loadValidRecord(input.tenantId, input.rawToken);
    return { email: record.email };
  }

  async redeemLink(input: RedeemLinkInput): Promise<{ email: string }> {
    const record = await this.loadValidRecord(input.tenantId, input.rawToken);
    // Atomic single-use gate: loadValidRecord's consumedAt check is a TOCTOU read.
    // Two concurrent redeems can both pass it, so the authoritative decision is the
    // conditional UPDATE — if it consumed 0 rows, another request already won the race
    // and we must NOT issue a session for this one.
    const consumed = await this.repo.markConsumed(
      input.tenantId,
      record.id,
      input.userId,
      input.ip,
      input.userAgent
    );
    if (!consumed) {
      throw new MagicLinkInvalidError('consumed');
    }
    return { email: record.email };
  }

  private hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  private async loadValidRecord(
    tenantId: string,
    rawToken: string
  ): Promise<PersistedMagicLinkToken> {
    const tokenHash = this.hashToken(rawToken);
    const record = await this.repo.findByHash(tenantId, tokenHash);
    if (!record) {
      throw new MagicLinkInvalidError('unknown');
    }
    if (record.consumedAt) {
      throw new MagicLinkInvalidError('consumed');
    }
    if (record.expiresAt.getTime() < Date.now()) {
      throw new MagicLinkInvalidError('expired');
    }
    return record;
  }
}
