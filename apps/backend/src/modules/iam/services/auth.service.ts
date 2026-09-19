import { randomUUID } from 'node:crypto';

import {
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  Optional,
  UnauthorizedException
} from '@nestjs/common';

import { IamService } from './iam.service.js';
import { MetricsService } from '../../../common/metrics/metrics.service.js';
import { ensureInMemoryModeAllowed } from '../../../common/runtime/in-memory-mode.guard.js';
import { backendEnv } from '../../../env.js';
import { RedisService } from '../../../infrastructure/cache/redis.service.js';
import { DatabaseService } from '../../../infrastructure/database/database.service.js';
import { SecretsService } from '../../../infrastructure/secrets/secrets.service.js';
import { TenantAccessService } from '../../../infrastructure/tenant/tenant-access.service.js';
import { AuditService } from '../../audit/audit.service.js';
import { IntegrationCryptoService } from '../../integrations/services/integration-crypto.service.js';
import {
  hashPassword,
  hashRefreshToken,
  isLegacyPwdSha256Hash,
  issueSignedAccessToken,
  issueToken,
  verifyPassword
} from '../crypto.util.js';
import { LOGIN_HISTORY_ACTIONS, toLoginHistoryEntry } from '../login-history.js';
import {
  DEFAULT_LOGIN_PROTECTION,
  lockedMessage,
  loginFailureKey,
  loginLockKey,
  shouldLock
} from '../login-protection.js';
import {
  buildOtpauthUrl,
  generateTotpSecret,
  signTotpChallenge,
  verifyTotpChallenge,
  verifyTotpCode
} from '../totp.util.js';

import type { RequestContext } from '../../../common/context/request-context.js';
import type { AuthEvent, Session, User } from '../iam.types.js';
import type { LoginHistoryEntry } from '../login-history.js';

/**
 * 2FA-роли (ФТ-G3): включать TOTP могут админские роли. Не HttpException —
 * internal control-flow, контроллеры превращают в ответ «нужен код».
 */
export const TOTP_ELIGIBLE_ROLES = ['tenant_admin', 'platform_admin'] as const;

/** Выбрасывается вместо выдачи сессии, когда у пользователя включена 2FA. */
export class TotpChallengeRequired extends Error {
  constructor(readonly challengeToken: string) {
    super('totp_required');
  }
}

export interface LoginPayload {
  login: string;
  password: string;
}

export type AuthMethod = 'password' | 'magic_link' | 'esia';

export interface IssueSessionOptions {
  authMethod: AuthMethod;
  databaseBacked: boolean;
  /**
   * 2FA уже пройдена на этом входе (второй шаг /auth/2fa/verify). Без этого флага
   * пользователю с totp_enabled сессия НЕ выдаётся ни одним способом входа
   * (пароль / magic-link / ЕСИА) — гейт в issueSessionForUser.
   */
  twoFactorSatisfied?: boolean;
}

@Injectable()
export class AuthService {
  private sessions: Session[] = [];
  private authEvents: AuthEvent[] = [];
  /** AES-256-GCM для TOTP-секретов — тот же application-crypto, что у секретов интеграций. */
  private readonly totpCrypto = new IntegrationCryptoService();
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(IamService)
    private readonly iamService: IamService,
    @Inject(AuditService)
    private readonly auditService: AuditService,
    @Inject(SecretsService)
    private readonly secretsService: SecretsService,
    @Inject(MetricsService)
    @Optional()
    private readonly metrics?: MetricsService,
    @Inject(DatabaseService)
    @Optional()
    private readonly databaseService?: DatabaseService,
    /**
     * Журнал 337: статус арендатора решает, выдавать ли сессию. @Optional — по той же причине,
     * что у DatabaseService: в памяти (тесты) гейта нет, и он молчит.
     */
    @Inject(TenantAccessService)
    @Optional()
    private readonly tenantAccess?: TenantAccessService,
    /*
     * ТЗ 17.1: счётчик неудачных попыток входа. Необязательная и ПОСЛЕДНЯЯ зависимость
     * (журнал 526): без общего хранилища вход обязан работать — просто без защиты от подбора,
     * и это честнее, чем не пускать вообще никого.
     */
    @Inject(RedisService)
    @Optional()
    private readonly redis?: RedisService
  ) {
    if (!this.databaseService) {
      ensureInMemoryModeAllowed('AuthService');
    }
    if (
      (backendEnv.NODE_ENV === 'production' || backendEnv.NODE_ENV === 'staging') &&
      !this.databaseService
    ) {
      throw new Error('AuthService requires DatabaseService in production/staging');
    }
  }

  /**
   * Журнал входов владельца учётной записи (ТЗ 17.1).
   *
   * Показывает СВОИ входы и свои неудачные попытки: это единственное место, где человек может
   * заметить, что в его запись заходил кто-то ещё. Права здесь не нужны и не нужны намеренно —
   * речь о собственной записи, а не о чужой; чужие входы видны в общем журнале аудита, куда
   * пускают по праву.
   *
   * Технические значения переводятся в слова НА СЕРВЕРЕ: `wrong_password` и строка браузера
   * администратору учебного центра не говорят ничего, а правило продукта запрещает сырые коды
   * как значения.
   */
  async getLoginHistory(
    tenantId: string,
    userId: string,
    limit = 20
  ): Promise<LoginHistoryEntry[]> {
    const collected = [];
    for (const action of LOGIN_HISTORY_ACTIONS) {
      /*
       * Запрашиваем по одному действию: отбор аудита принимает ровно одно, а склеивать их
       * строкой значило бы полагаться на то, как он разбирает параметр.
       */
      const page = await this.auditService.list(tenantId, {
        actor: userId,
        action,
        limit
      });
      collected.push(...page);
    }
    return collected
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, limit)
      .map((entry) => toLoginHistoryEntry(entry));
  }

  /**
   * Не закрыт ли вход в эту запись прямо сейчас (ТЗ 17.1).
   *
   * Без общего хранилища проверка молчит: вход обязан работать и там, где хранилище не поднято.
   * Это осознанный размен — лучше вход без защиты от подбора, чем система, которая не пускает
   * никого из-за упавшего вспомогательного сервиса.
   */
  private async assertLoginNotLocked(tenantId: string, login: string): Promise<void> {
    if (!this.redis) return;
    let secondsLeft: number;
    try {
      secondsLeft = await this.redis.secondsToLive(loginLockKey(tenantId, login));
    } catch {
      // Хранилище недоступно — не мешаем входить. Причина та же, что выше.
      return;
    }
    if (secondsLeft <= 0) return;
    this.metrics?.incrementAuthFailure({ reason: 'login_locked', phase: 'login_lock' });
    throw new UnauthorizedException({
      code: 'login_locked',
      message: lockedMessage(secondsLeft / 60)
    });
  }

  /**
   * Учесть неудачную попытку и, если их набралось слишком много, закрыть вход (ТЗ 17.1).
   *
   * Каждая неудача пишется в журнал независимо от счётчика: «журнал входов — когда, откуда,
   * успешно или нет» и есть то, что спрашивают при проверке. Раньше в журнал попадали только
   * УСПЕШНЫЕ входы, то есть по нему нельзя было увидеть ни подбора, ни того, что человек не
   * может войти (журнал 573).
   */
  private async registerLoginFailure(
    tenantId: string,
    login: string,
    reason: 'unknown_login' | 'wrong_password' | 'user_blocked',
    context: RequestContext,
    userId?: string
  ): Promise<void> {
    const settings = DEFAULT_LOGIN_PROTECTION;
    let failures = 0;
    if (this.redis) {
      try {
        failures = await this.redis.incrementWithWindow(
          loginFailureKey(tenantId, login),
          settings.windowMinutes * 60
        );
        if (shouldLock(failures, settings)) {
          await this.redis.setWithTtl(
            loginLockKey(tenantId, login),
            String(Date.now()),
            settings.lockMinutes * 60
          );
          await this.redis.remove(loginFailureKey(tenantId, login));
        }
      } catch {
        // Хранилище недоступно: защита от подбора не сработает, но запись в журнал — да.
        failures = 0;
      }
    }

    await this.auditService.writeCritical(
      {
        tenantId,
        /*
         * Актор неизвестен, когда такого логина нет. Ставим служебное значение, а не логин:
         * логин — это то, что ввёл посторонний, и в поле «кто сделал» ему не место.
         */
        actorId: userId ?? 'anonymous',
        action: 'auth.login_failed',
        entityType: 'iam.user',
        entityId: userId ?? 'unknown',
        metadata: {
          reason,
          failures,
          /* Логин в метаданных нужен для разбора: по нему видно, чью запись перебирают. */
          login,
          locked: shouldLock(failures, settings)
        },
        requestId: context.requestId,
        correlationId: context.correlationId,
        ip: context.ip,
        userAgent: context.userAgent
      },
      { skipDatabase: !this.databaseService }
    );
  }

  /** Успешный вход обнуляет серию: считать неудачи «через успех» бессмысленно. */
  private async clearLoginFailures(tenantId: string, login: string): Promise<void> {
    if (!this.redis) return;
    try {
      await this.redis.remove(loginFailureKey(tenantId, login));
    } catch {
      // Не удалось убрать счётчик — не повод отказывать во входе, который уже состоялся.
    }
  }

  async login(tenantId: string, payload: LoginPayload, context: RequestContext) {
    /*
     * ТЗ 17.1: вход, закрытый после серии неудач, проверяется ПЕРВЫМ — до поиска пользователя.
     * Иначе по времени ответа можно было бы отличить существующий логин от несуществующего.
     */
    await this.assertLoginNotLocked(tenantId, payload.login);

    const resolved = await this.iamService.findUserByLogin(tenantId, payload.login);
    if (!resolved) {
      this.metrics?.incrementAuthFailure({ reason: 'invalid_credentials', phase: 'login_lookup' });
      /*
       * Неудача считается и для НЕСУЩЕСТВУЮЩЕГО логина. Иначе перебор чужих логинов ничем не
       * ограничен, а сам факт «этот логин не считается» выдаёт, что такого человека нет.
       */
      await this.registerLoginFailure(tenantId, payload.login, 'unknown_login', context);
      throw new UnauthorizedException({
        code: 'invalid_credentials',
        message: 'Invalid credentials'
      });
    }

    const { user, databaseBacked } = resolved;

    if (user.status === 'blocked') {
      this.metrics?.incrementAuthFailure({ reason: 'user_blocked', phase: 'login_status' });
      await this.registerLoginFailure(tenantId, payload.login, 'user_blocked', context, user.id);
      throw new UnauthorizedException({ code: 'user_blocked', message: 'User is blocked' });
    }

    if (!verifyPassword(payload.password, user.passwordHash)) {
      this.metrics?.incrementAuthFailure({
        reason: 'invalid_credentials',
        phase: 'login_password'
      });
      await this.registerLoginFailure(tenantId, payload.login, 'wrong_password', context, user.id);
      throw new UnauthorizedException({
        code: 'invalid_credentials',
        message: 'Invalid credentials'
      });
    }

    /* Пароль сошёлся — счётчик обнуляется: серия прервана. */
    await this.clearLoginFailures(tenantId, payload.login);

    const persistRelational = !this.databaseService || databaseBacked;

    if (isLegacyPwdSha256Hash(user.passwordHash)) {
      await this.iamService.upgradePasswordHash(tenantId, user.id, hashPassword(payload.password));
      await this.auditService.writeCritical(
        {
          tenantId,
          actorId: user.id,
          action: 'iam.password_rehashed',
          entityType: 'iam.user',
          entityId: user.id,
          metadata: {
            reason: 'legacy_sha256_seed',
            algorithm: 'scrypt'
          },
          requestId: context.requestId,
          correlationId: context.correlationId,
          ip: context.ip,
          userAgent: context.userAgent
        },
        { skipDatabase: !persistRelational }
      );
    }
    return this.issueSessionForUser(user, context, {
      authMethod: 'password',
      databaseBacked
    });
  }

  async issueSessionForUser(
    user: User,
    context: RequestContext,
    options: IssueSessionOptions
  ): Promise<Awaited<ReturnType<AuthService['createSession']>>> {
    // Ревизия 2026-08-27 (порция 22): проверка блокировки живёт в ЕДИНОМ гейте — иначе
    // каждый новый способ входа (ЕСИА, magic-link) обязан помнить о ней сам, и ЕСИА
    // с magic-link уже не помнили. Стоит ДО TOTP: заблокированному не выдаётся даже challenge.
    if (user.status === 'blocked') {
      this.metrics?.incrementAuthFailure({ reason: 'user_blocked', phase: 'issue_session' });
      throw new UnauthorizedException({ code: 'user_blocked', message: 'User is blocked' });
    }
    // Журнал 337: тот же единый гейт — для статуса АРЕНДАТОРА. Приостановленный за неуплату
    // или архивный центр не выдаёт сессий ни одним способом входа; стоит до TOTP — challenge
    // тоже не выдаётся.
    await this.assertTenantAcceptsSessions(user.tenantId, 'issue_session');
    if (user.totpEnabled === true && options.twoFactorSatisfied !== true) {
      // ФТ-G3: единый гейт на ВСЕ способы входа. Challenge — подписанный конверт с TTL 5 мин;
      // сессии, куки и auth-события появляются только после верного кода (verifyTotpAndLogin).
      throw new TotpChallengeRequired(
        signTotpChallenge(
          {
            sub: user.id,
            tenant_id: user.tenantId,
            method: options.authMethod,
            database_backed: options.databaseBacked
          },
          this.secretsService.getJwtSigningSecret(),
          Date.now()
        )
      );
    }
    const persistRelational = !this.databaseService || options.databaseBacked;
    const tokens = await this.createSession(user, persistRelational);
    const eventType = options.authMethod === 'magic_link' ? 'magic_link_login' : 'login';
    const auditAction =
      options.authMethod === 'magic_link'
        ? 'auth.magic_link_login'
        : options.authMethod === 'esia'
          ? 'auth.esia_login'
          : 'auth.login';
    await this.pushAuthEvent(user.tenantId, user.id, eventType, persistRelational);
    await this.auditService.writeCritical(
      {
        tenantId: user.tenantId,
        actorId: user.id,
        action: auditAction,
        entityType: 'iam.user',
        entityId: user.id,
        requestId: context.requestId,
        correlationId: context.correlationId,
        ip: context.ip,
        userAgent: context.userAgent
      },
      { skipDatabase: !persistRelational }
    );

    return tokens;
  }

  /**
   * ФТ-D2.2 (Фаза 4 Task 3): вход «от имени» для поддержки платформы. Выдаёт обычную
   * сессию ЦЕЛЕВОГО пользователя. TOTP-гейт цели сознательно не проходится: личность
   * актора уже подтверждена его собственной платформенной сессией (включая его 2FA),
   * а второй фактор чужого пользователя поддержке недоступен по определению.
   * ОБЯЗАТЕЛЬНАЯ запись в аудит — на вызывающей стороне (PlatformTenantsService)
   * ДО выдачи сессии: сбой журнала отменяет вход.
   */
  async issueImpersonatedSession(
    tenantId: string,
    userId: string,
    /** Порция 33 (журнал 270): кто именно из поддержки входит — попадёт в журнал. */
    impersonatedBy?: string
  ): Promise<Awaited<ReturnType<AuthService['createSession']>>> {
    const user = await this.iamService.getUser(tenantId, userId);
    if (user.status === 'blocked') {
      throw new UnauthorizedException({ code: 'user_blocked', message: 'User is blocked' });
    }
    return this.createSession(user, true, undefined, impersonatedBy);
  }

  /** Второй шаг логина (ФТ-G3): challenge из issueSessionForUser + верный TOTP-код → сессия. */
  async verifyTotpAndLogin(
    tenantId: string,
    challengeToken: string,
    code: string,
    context: RequestContext
  ): Promise<Awaited<ReturnType<AuthService['createSession']>>> {
    let payload: ReturnType<typeof verifyTotpChallenge>;
    try {
      payload = verifyTotpChallenge(
        challengeToken,
        this.secretsService.getJwtSigningSecret(),
        Date.now()
      );
    } catch {
      this.metrics?.incrementAuthFailure({ reason: 'invalid_totp_challenge', phase: 'totp' });
      throw new UnauthorizedException({
        code: 'invalid_totp_challenge',
        message: 'Two-factor challenge is invalid or expired'
      });
    }
    if (payload.tenant_id !== tenantId) {
      throw new UnauthorizedException({
        code: 'invalid_totp_challenge',
        message: 'Two-factor challenge is invalid or expired'
      });
    }
    const user = await this.iamService.getUser(tenantId, payload.sub);
    if (user.status === 'blocked') {
      throw new UnauthorizedException({ code: 'user_blocked', message: 'User is blocked' });
    }
    const persistRelational = !this.databaseService || payload.database_backed;
    const step = this.verifyCodeAgainstUser(user, code);
    if (step === 'undecryptable') {
      this.logger.error(
        `TOTP secret for user ${user.id} cannot be decrypted: verification is impossible ` +
          'until the key is restored. This is an infrastructure fault, not a wrong code.'
      );
      this.metrics?.incrementAuthFailure({ reason: 'totp_secret_undecryptable', phase: 'totp' });
      throw new UnauthorizedException({
        code: 'invalid_totp_code',
        message: 'Two-factor code is invalid'
      });
    }
    if (step === null) {
      await this.pushAuthEvent(tenantId, user.id, 'totp_failed', persistRelational);
      this.metrics?.incrementAuthFailure({ reason: 'invalid_totp_code', phase: 'totp' });
      throw new UnauthorizedException({
        code: 'invalid_totp_code',
        message: 'Two-factor code is invalid'
      });
    }
    await this.iamService.updateTotpLastUsedStep(tenantId, user.id, step);
    await this.pushAuthEvent(tenantId, user.id, 'totp_verified', persistRelational);
    return this.issueSessionForUser(user, context, {
      authMethod: payload.method,
      databaseBacked: payload.database_backed,
      twoFactorSatisfied: true
    });
  }

  /** Настройка 2FA: сгенерировать секрет (2FA ещё выключена — включит confirmTotp верным кодом). */
  async setupTotp(
    tenantId: string,
    userId: string,
    context: RequestContext
  ): Promise<{ secret: string; otpauthUrl: string }> {
    const roles = await this.iamService.getUserRoles(tenantId, userId);
    const eligible = roles.some((role) =>
      (TOTP_ELIGIBLE_ROLES as readonly string[]).includes(role.code)
    );
    if (!eligible) {
      throw new ForbiddenException({
        code: 'totp_role_not_eligible',
        message: 'Two-factor auth is available for admin roles only'
      });
    }
    const user = await this.iamService.getUser(tenantId, userId);
    const secret = generateTotpSecret();
    await this.iamService.setTotpSecret(tenantId, userId, this.totpCrypto.encrypt(secret));
    await this.auditService.writeCritical({
      tenantId,
      actorId: userId,
      action: 'auth.totp_setup_started',
      entityType: 'iam.user',
      entityId: userId,
      requestId: context.requestId,
      correlationId: context.correlationId,
      ip: context.ip,
      userAgent: context.userAgent
    });
    return {
      secret,
      otpauthUrl: buildOtpauthUrl({
        secretBase32: secret,
        accountName: `${user.login}@${tenantId}`,
        // BR-010: смена issuer не ломает существующие привязки (секрет тот же),
        // новое имя видно только при первичной привязке в приложении-аутентификаторе.
        issuer: 'trudskill'
      })
    };
  }

  /** Подтвердить настройку кодом из приложения → 2FA включена. */
  async confirmTotp(
    tenantId: string,
    userId: string,
    code: string,
    context: RequestContext
  ): Promise<{ enabled: true }> {
    const user = await this.iamService.getUser(tenantId, userId);
    if (!user.totpSecretEncrypted) {
      throw new UnauthorizedException({
        code: 'totp_not_configured',
        message: 'Run 2FA setup first'
      });
    }
    const step = this.verifyCodeAgainstUser(user, code);
    if (step === 'undecryptable') {
      this.logger.error(
        `TOTP secret for user ${userId} cannot be decrypted: verification is impossible ` +
          'until the key is restored. This is an infrastructure fault, not a wrong code.'
      );
      this.metrics?.incrementAuthFailure({ reason: 'totp_secret_undecryptable', phase: 'totp' });
      throw new UnauthorizedException({
        code: 'invalid_totp_code',
        message: 'Two-factor code is invalid'
      });
    }
    if (step === null) {
      throw new UnauthorizedException({
        code: 'invalid_totp_code',
        message: 'Two-factor code is invalid'
      });
    }
    await this.iamService.updateTotpLastUsedStep(tenantId, userId, step);
    await this.iamService.setTotpEnabled(tenantId, userId, true);
    await this.auditService.writeCritical({
      tenantId,
      actorId: userId,
      action: 'auth.totp_enabled',
      entityType: 'iam.user',
      entityId: userId,
      requestId: context.requestId,
      correlationId: context.correlationId,
      ip: context.ip,
      userAgent: context.userAgent
    });
    return { enabled: true };
  }

  /** Выключить 2FA — только с верным текущим кодом (угнанной сессии недостаточно). */
  async disableTotp(
    tenantId: string,
    userId: string,
    code: string,
    context: RequestContext
  ): Promise<{ enabled: false }> {
    const user = await this.iamService.getUser(tenantId, userId);
    if (user.totpEnabled !== true) {
      return { enabled: false };
    }
    const step = this.verifyCodeAgainstUser(user, code);
    if (step === null) {
      throw new UnauthorizedException({
        code: 'invalid_totp_code',
        message: 'Two-factor code is invalid'
      });
    }
    await this.iamService.setTotpEnabled(tenantId, userId, false);
    await this.auditService.writeCritical({
      tenantId,
      actorId: userId,
      action: 'auth.totp_disabled',
      entityType: 'iam.user',
      entityId: userId,
      requestId: context.requestId,
      correlationId: context.correlationId,
      ip: context.ip,
      userAgent: context.userAgent
    });
    return { enabled: false };
  }

  async getTotpStatus(
    tenantId: string,
    userId: string
  ): Promise<{ enabled: boolean; pending: boolean; eligible: boolean }> {
    const [user, roles] = await Promise.all([
      this.iamService.getUser(tenantId, userId),
      this.iamService.getUserRoles(tenantId, userId)
    ]);
    return {
      enabled: user.totpEnabled === true,
      pending: user.totpEnabled !== true && Boolean(user.totpSecretEncrypted),
      eligible: roles.some((role) => (TOTP_ELIGIBLE_ROLES as readonly string[]).includes(role.code))
    };
  }

  /** Расшифровать секрет и проверить код с окном ±1 и anti-replay по последнему шагу. */
  /** Журнал 337: отказ по статусу арендатора — с метрикой, как у блокировки пользователя. */
  private async assertTenantAcceptsSessions(tenantId: string, phase: string): Promise<void> {
    try {
      await this.tenantAccess?.assertAcceptsSessions(tenantId);
    } catch (error) {
      const code =
        error instanceof HttpException
          ? (error.getResponse() as { code?: string }).code
          : undefined;
      this.metrics?.incrementAuthFailure({ reason: code ?? 'tenant_unavailable', phase });
      throw error;
    }
  }

  private verifyCodeAgainstUser(user: User, code: string): number | 'undecryptable' | null {
    if (!user.totpSecretEncrypted) {
      return null;
    }
    let secret: string;
    try {
      secret = this.totpCrypto.decrypt(user.totpSecretEncrypted);
    } catch {
      // Сбой расшифровки — это НЕ ошибка пользователя (журнал 332). Провёрнутый ключ или
      // побитый шифртекст означают, что человек с ВЕРНЫМ кодом войти не может, и раньше это
      // было неотличимо от «ввёл не то»: тот же ответ, то же событие, тот же счётчик.
      // Наружу ответ не меняем — подсказывать нападающему, что именно сломалось, нельзя;
      // различать должны записи.
      return 'undecryptable';
    }
    return verifyTotpCode(secret, code, {
      nowMs: Date.now(),
      minStepExclusive: user.totpLastUsedStep ?? null
    });
  }

  async refresh(
    tenantId: string,
    refreshToken: string,
    csrfToken: string,
    context: RequestContext
  ) {
    if (!csrfToken) {
      this.metrics?.incrementAuthFailure({ reason: 'invalid_csrf', phase: 'refresh' });
      throw new UnauthorizedException({ code: 'invalid_csrf', message: 'Invalid CSRF token' });
    }

    const tokenHash = this.hashSessionToken(refreshToken);
    const csrfTokenHash = this.hashCsrfToken(csrfToken);
    const activeSession = await this.consumeRefreshSession(tenantId, tokenHash, csrfTokenHash);
    if (Date.parse(activeSession.expiresAt) <= Date.now()) {
      this.metrics?.incrementAuthFailure({ reason: 'session_expired', phase: 'refresh' });
      throw new UnauthorizedException({ code: 'session_expired', message: 'Session expired' });
    }
    const user = await this.iamService.getUser(tenantId, activeSession.userId);
    /*
     * Ревизия 2026-08-27 (порция 22): без этой проверки блокировка не отбирала доступ —
     * живая вкладка продлевала цепочку сессий бессрочно (каждая ротация даёт новый срок).
     * Заодно гасим ВСЮ семью сессий: отказ заблокированному — не «попробуйте позже».
     */
    if (user.status === 'blocked') {
      this.metrics?.incrementAuthFailure({ reason: 'user_blocked', phase: 'refresh' });
      await this.revokeAllSessionsForUserInternal(tenantId, user.id);
      throw new UnauthorizedException({ code: 'user_blocked', message: 'User is blocked' });
    }
    /*
     * Журнал 337: центр приостановили ПОСЛЕ входа — живая вкладка не должна продлевать доступ.
     * Семью не гасим: это «попробуйте после оплаты», а не блокировка; потреблённый refresh-токен
     * и так кончает цепочку. Сессия «от имени» пропускается: поддержка вошла в приостановленный
     * центр законно (архивный отбит на входе), и ронять её через 15 минут незачем.
     */
    if (!activeSession.impersonatedBy) {
      await this.assertTenantAcceptsSessions(tenantId, 'refresh');
    }
    const persistRelational = await this.shouldPersistRelationalSideEffects(tenantId, user.id);
    // Порция 33 (журнал 270): признак «вошли от имени» переносится в новую сессию —
    // иначе он исчез бы при первом обновлении токена, а доступ остался бы.
    const nextTokens = await this.createSession(
      user,
      persistRelational,
      activeSession.jti,
      activeSession.impersonatedBy
    );
    await this.pushAuthEvent(tenantId, user.id, 'refresh', persistRelational);
    await this.auditService.writeCritical(
      {
        tenantId,
        actorId: user.id,
        action: 'auth.refresh',
        entityType: 'iam.session',
        entityId: activeSession.id,
        requestId: context.requestId,
        correlationId: context.correlationId,
        ip: context.ip,
        userAgent: context.userAgent,
        oldValues: { revokedAt: null },
        newValues: { revokedAt: new Date().toISOString() }
      },
      { skipDatabase: !persistRelational }
    );

    return nextTokens;
  }

  async logout(
    tenantId: string,
    userId: string,
    sessionId: string,
    context: RequestContext
  ): Promise<void> {
    const session = await this.findSession(sessionId, tenantId, userId);
    if (!session) {
      return;
    }

    await this.revokeSessionInternal(session.id, tenantId, userId);
    const persistRelational = await this.shouldPersistRelationalSideEffects(tenantId, userId);
    await this.pushAuthEvent(tenantId, userId, 'logout', persistRelational);
    await this.auditService.writeCritical(
      {
        tenantId,
        actorId: userId,
        action: 'auth.logout',
        entityType: 'iam.session',
        entityId: session.id,
        requestId: context.requestId,
        correlationId: context.correlationId
      },
      { skipDatabase: !persistRelational }
    );
  }

  async listSessions(tenantId: string, userId: string): Promise<Session[]> {
    if (!this.databaseService) {
      return this.sessions.filter(
        (session) => session.tenantId === tenantId && session.userId === userId
      );
    }

    const rows = await this.databaseService.query<{
      id: string;
      tenant_id: string;
      user_id: string;
      jti: string;
      parent_jti: string | null;
      refresh_token_hash: string;
      csrf_token_hash: string | null;
      expires_at: string;
      revoked_at: string | null;
      rotated_at: string | null;
      consumed_at: string | null;
      revoke_reason: string | null;
      impersonated_by: string | null;
    }>(
      `
        select id, tenant_id, user_id, jti, parent_jti, refresh_token_hash, csrf_token_hash,
               expires_at::text as expires_at, revoked_at::text as revoked_at,
               rotated_at::text as rotated_at, consumed_at::text as consumed_at, revoke_reason,
               impersonated_by
        from iam.sessions
        where tenant_id = $1 and user_id = $2
        order by created_at desc
      `,
      [tenantId, userId]
    );

    const fromDb = new Map<string, Session>(
      rows.map((row) => [
        row.id,
        {
          id: row.id,
          tenantId: row.tenant_id,
          userId: row.user_id,
          jti: row.jti,
          parentJti: row.parent_jti ?? undefined,
          refreshTokenHash: row.refresh_token_hash,
          csrfTokenHash: row.csrf_token_hash ?? undefined,
          expiresAt: row.expires_at,
          revokedAt: row.revoked_at ?? undefined,
          rotatedAt: row.rotated_at ?? undefined,
          consumedAt: row.consumed_at ?? undefined,
          revokeReason: row.revoke_reason ?? undefined,
          // Порция 33 (журнал 270): признак «вошли от имени» переживает ротацию токена.
          impersonatedBy: row.impersonated_by ?? undefined
        }
      ])
    );

    for (const session of this.sessions) {
      if (session.tenantId === tenantId && session.userId === userId && !fromDb.has(session.id)) {
        fromDb.set(session.id, session);
      }
    }

    return [...fromDb.values()].sort((a, b) => Date.parse(b.expiresAt) - Date.parse(a.expiresAt));
  }

  async revokeSession(
    tenantId: string,
    actorId: string,
    sessionId: string,
    context: RequestContext
  ): Promise<void> {
    const session = await this.findSession(sessionId, tenantId);
    if (!session || session.revokedAt) {
      return;
    }

    await this.revokeSessionInternal(session.id, tenantId, session.userId);
    const persistRelational = await this.shouldPersistRelationalSideEffects(tenantId, actorId);
    await this.pushAuthEvent(tenantId, actorId, 'session_revoke', persistRelational);
    await this.auditService.writeCritical(
      {
        tenantId,
        actorId,
        action: 'auth.session_revoke',
        entityType: 'iam.session',
        entityId: session.id,
        requestId: context.requestId,
        correlationId: context.correlationId,
        oldValues: { revokedAt: null },
        newValues: { revokedAt: new Date().toISOString() }
      },
      { skipDatabase: !persistRelational }
    );
  }

  async isSessionActive(tenantId: string, userId: string, sessionId: string): Promise<boolean> {
    const session = await this.findSession(sessionId, tenantId, userId);
    if (!session || session.revokedAt) {
      return false;
    }
    return Date.parse(session.expiresAt) > Date.now();
  }

  async logoutAll(tenantId: string, userId: string, context: RequestContext): Promise<void> {
    await this.revokeAllSessionsForUserInternal(tenantId, userId);

    const persistRelational = await this.shouldPersistRelationalSideEffects(tenantId, userId);
    await this.pushAuthEvent(tenantId, userId, 'logout_all', persistRelational);
    await this.auditService.writeCritical(
      {
        tenantId,
        actorId: userId,
        action: 'auth.logout_all',
        entityType: 'iam.session',
        entityId: userId,
        requestId: context.requestId,
        correlationId: context.correlationId
      },
      { skipDatabase: !persistRelational }
    );
  }

  /**
   * Ревизия 2026-08-27 (порция 22, журнал 266): рычаг администратора. Блокировка обязана
   * отбирать доступ НЕМЕДЛЕННО, а не после истечения токена — до этого убить чужие сессии
   * было нечем (`logout-all` работает только со своими). Зовётся из PUT /users/:id при
   * переводе в blocked; actor в журнале — тот, кто заблокировал, а не сам заблокированный.
   */
  async revokeAllSessionsForUser(
    tenantId: string,
    userId: string,
    context: RequestContext
  ): Promise<void> {
    await this.revokeAllSessionsForUserInternal(tenantId, userId);
    const persistRelational = await this.shouldPersistRelationalSideEffects(tenantId, userId);
    await this.auditService.writeCritical(
      {
        tenantId,
        actorId: context.userId,
        action: 'auth.sessions_revoked_on_block',
        entityType: 'iam.user',
        entityId: userId,
        requestId: context.requestId,
        correlationId: context.correlationId,
        ip: context.ip,
        userAgent: context.userAgent
      },
      { skipDatabase: !persistRelational }
    );
  }

  async getAuthEvents(tenantId: string): Promise<AuthEvent[]> {
    if (!this.databaseService) {
      return this.authEvents.filter((event) => event.tenantId === tenantId);
    }

    const rows = await this.databaseService.query<{
      id: string;
      tenant_id: string;
      user_id: string;
      type: AuthEvent['type'];
      created_at: string;
    }>(
      `
        select id, tenant_id, user_id, type, created_at::text as created_at
        from iam.auth_events
        where tenant_id = $1
        order by created_at desc
      `,
      [tenantId]
    );

    const fromDb = rows.map((row) => ({
      id: row.id,
      tenantId: row.tenant_id,
      userId: row.user_id,
      type: row.type,
      createdAt: row.created_at
    }));

    const fromMemory = this.authEvents.filter((event) => event.tenantId === tenantId);
    return [...fromMemory, ...fromDb].sort(
      (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
    );
  }

  private async shouldPersistRelationalSideEffects(
    tenantId: string,
    userId: string
  ): Promise<boolean> {
    return (
      !this.databaseService || (await this.iamService.isUserPersistedInDatabase(tenantId, userId))
    );
  }

  /**
   * @param impersonatedBy порция 33 (журнал 270): кто из поддержки вошёл «от имени».
   * Признак кладётся и в сессию, и в токен — по нему каждое последующее действие
   * помечается в журнале, иначе действия поддержки неотличимы от действий клиента.
   */
  private async createSession(
    user: User,
    persistRelational: boolean,
    parentJti?: string,
    impersonatedBy?: string
  ) {
    const refreshToken = issueToken();
    const csrfToken = issueToken();
    const session: Session = {
      id: `s_${randomUUID().replace(/-/g, '')}`,
      tenantId: user.tenantId,
      userId: user.id,
      jti: `jti_${randomUUID().replace(/-/g, '')}`,
      parentJti,
      refreshTokenHash: this.hashSessionToken(refreshToken),
      csrfTokenHash: this.hashCsrfToken(csrfToken),
      expiresAt: new Date(Date.now() + backendEnv.REFRESH_TOKEN_TTL_SECONDS * 1000).toISOString(),
      ...(impersonatedBy ? { impersonatedBy } : {})
    };

    if (!this.databaseService || !persistRelational) {
      this.sessions.push(session);
    } else {
      await this.databaseService.query(
        `
          insert into iam.sessions (
            id,
            tenant_id,
            user_id,
            jti,
            parent_jti,
            refresh_token_hash,
            csrf_token_hash,
            expires_at,
            impersonated_by
          )
          values ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9)
        `,
        [
          session.id,
          session.tenantId,
          session.userId,
          session.jti,
          session.parentJti ?? null,
          session.refreshTokenHash,
          session.csrfTokenHash!,
          session.expiresAt,
          session.impersonatedBy ?? null
        ]
      );
    }

    const userRoles = await this.iamService.getUserRoles(user.tenantId, user.id);
    const permissionCodes = await this.iamService.resolvePermissions(user.tenantId, user.id);
    const roleCodes = userRoles.map((role) => role.code);
    const accessToken = issueSignedAccessToken(
      {
        sub: user.id,
        tenant_id: user.tenantId,
        session_id: session.id,
        roles: roleCodes,
        ...(session.impersonatedBy ? { impersonated_by: session.impersonatedBy } : {})
      },
      this.secretsService.getJwtSigningSecret(),
      backendEnv.ACCESS_TOKEN_TTL_SECONDS
    );

    return {
      accessToken,
      refreshToken,
      csrfToken,
      sessionId: session.id,
      expiresIn: backendEnv.ACCESS_TOKEN_TTL_SECONDS,
      claims: {
        tenant_id: user.tenantId,
        role_codes: roleCodes,
        permission_codes: permissionCodes,
        session_id: session.id
      }
    };
  }

  private async pushAuthEvent(
    tenantId: string,
    userId: string,
    type: AuthEvent['type'],
    persistRelational: boolean
  ): Promise<void> {
    const event: AuthEvent = {
      id: `ae_${randomUUID().replace(/-/g, '')}`,
      tenantId,
      userId,
      type,
      createdAt: new Date().toISOString()
    };

    if (!this.databaseService || !persistRelational) {
      this.authEvents.push(event);
      return;
    }

    await this.databaseService.query(
      `
        insert into iam.auth_events (id, tenant_id, user_id, type, payload, created_at)
        values ($1, $2, $3, $4, '{}'::jsonb, $5::timestamptz)
      `,
      [event.id, event.tenantId, event.userId, event.type, event.createdAt]
    );
  }

  private async findSession(
    sessionId: string,
    tenantId: string,
    userId?: string
  ): Promise<Session | undefined> {
    if (!this.databaseService) {
      return this.sessions.find(
        (item) =>
          item.id === sessionId && item.tenantId === tenantId && (!userId || item.userId === userId)
      );
    }

    const rows = await this.databaseService.query<{
      id: string;
      tenant_id: string;
      user_id: string;
      jti: string;
      parent_jti: string | null;
      refresh_token_hash: string;
      csrf_token_hash: string | null;
      expires_at: string;
      revoked_at: string | null;
      rotated_at: string | null;
      consumed_at: string | null;
      revoke_reason: string | null;
      impersonated_by: string | null;
    }>(
      `
        select id, tenant_id, user_id, jti, parent_jti, refresh_token_hash, csrf_token_hash,
               expires_at::text as expires_at, revoked_at::text as revoked_at,
               rotated_at::text as rotated_at, consumed_at::text as consumed_at, revoke_reason,
               impersonated_by
        from iam.sessions
        where id = $1 and tenant_id = $2 and ($3::text is null or user_id = $3)
        limit 1
      `,
      [sessionId, tenantId, userId ?? null]
    );

    const row = rows[0];
    if (row) {
      return {
        id: row.id,
        tenantId: row.tenant_id,
        userId: row.user_id,
        jti: row.jti,
        parentJti: row.parent_jti ?? undefined,
        refreshTokenHash: row.refresh_token_hash,
        csrfTokenHash: row.csrf_token_hash ?? undefined,
        expiresAt: row.expires_at,
        revokedAt: row.revoked_at ?? undefined,
        rotatedAt: row.rotated_at ?? undefined,
        consumedAt: row.consumed_at ?? undefined,
        revokeReason: row.revoke_reason ?? undefined,
        impersonatedBy: row.impersonated_by ?? undefined
      };
    }

    return this.sessions.find(
      (item) =>
        item.id === sessionId && item.tenantId === tenantId && (!userId || item.userId === userId)
    );
  }

  private async consumeRefreshSession(
    tenantId: string,
    refreshTokenHash: string,
    csrfTokenHash: string
  ): Promise<Session> {
    if (!this.databaseService) {
      const activeSession = this.sessions.find(
        (session) => session.tenantId === tenantId && session.refreshTokenHash === refreshTokenHash
      );
      if (!activeSession) {
        throw new UnauthorizedException({
          code: 'invalid_refresh',
          message: 'Refresh token is invalid'
        });
      }
      if (activeSession.csrfTokenHash !== csrfTokenHash) {
        throw new UnauthorizedException({ code: 'invalid_csrf', message: 'Invalid CSRF token' });
      }
      if (activeSession.consumedAt || activeSession.revokedAt) {
        this.revokeFamilyInMemory(tenantId, activeSession.jti, 'refresh_replay_detected');
        throw new UnauthorizedException({
          code: 'refresh_replay',
          message: 'Refresh token replay detected'
        });
      }
      const now = new Date().toISOString();
      activeSession.consumedAt = now;
      activeSession.rotatedAt = now;
      activeSession.revokedAt = now;
      activeSession.revokeReason = 'rotated';
      return activeSession;
    }

    const consumed = await this.databaseService.withTransaction(async (client) => {
      const rows = await this.databaseService!.query<{
        id: string;
        tenant_id: string;
        user_id: string;
        jti: string;
        parent_jti: string | null;
        refresh_token_hash: string;
        csrf_token_hash: string | null;
        expires_at: string;
        consumed_at: string | null;
        revoked_at: string | null;
      }>(
        `
          select id, tenant_id, user_id, jti, parent_jti, refresh_token_hash, csrf_token_hash,
                 expires_at::text as expires_at, consumed_at::text as consumed_at, revoked_at::text as revoked_at
          from iam.sessions
          where tenant_id = $1 and refresh_token_hash = $2
          order by created_at desc
          for update skip locked
          limit 1
        `,
        [tenantId, refreshTokenHash],
        client
      );

      const row = rows[0];
      if (!row) {
        return null;
      }
      if (row.csrf_token_hash !== csrfTokenHash) {
        throw new UnauthorizedException({ code: 'invalid_csrf', message: 'Invalid CSRF token' });
      }
      if (row.consumed_at || row.revoked_at) {
        await this.databaseService!.query(
          `
            with recursive family as (
              select id, tenant_id, jti
              from iam.sessions
              where tenant_id = $1 and jti = $2
              union all
              select s.id, s.tenant_id, s.jti
              from iam.sessions s
              join family f on s.tenant_id = f.tenant_id and s.parent_jti = f.jti
            )
            update iam.sessions target
            set revoked_at = coalesce(target.revoked_at, now()),
                revoke_reason = coalesce(target.revoke_reason, 'refresh_replay_detected'),
                updated_at = now()
            from family
            where target.id = family.id
          `,
          [tenantId, row.jti],
          client
        );
        throw new UnauthorizedException({
          code: 'refresh_replay',
          message: 'Refresh token replay detected'
        });
      }

      const revokedRows = await this.databaseService!.query<{ id: string }>(
        `
          update iam.sessions
          set consumed_at = now(), rotated_at = now(), revoked_at = now(), revoke_reason = 'rotated', updated_at = now()
          where id = $1 and revoked_at is null
          returning id
        `,
        [row.id],
        client
      );
      if (!revokedRows.length) {
        return null;
      }

      return {
        id: row.id,
        tenantId: row.tenant_id,
        userId: row.user_id,
        jti: row.jti,
        parentJti: row.parent_jti ?? undefined,
        refreshTokenHash: row.refresh_token_hash,
        csrfTokenHash: row.csrf_token_hash ?? undefined,
        expiresAt: row.expires_at
      } as Session;
    });

    if (consumed) {
      return consumed;
    }

    const activeSession = this.sessions.find(
      (session) => session.tenantId === tenantId && session.refreshTokenHash === refreshTokenHash
    );
    if (!activeSession) {
      throw new UnauthorizedException({
        code: 'invalid_refresh',
        message: 'Refresh token is invalid'
      });
    }
    if (activeSession.csrfTokenHash !== csrfTokenHash) {
      throw new UnauthorizedException({ code: 'invalid_csrf', message: 'Invalid CSRF token' });
    }
    if (activeSession.consumedAt || activeSession.revokedAt) {
      this.revokeFamilyInMemory(tenantId, activeSession.jti, 'refresh_replay_detected');
      throw new UnauthorizedException({
        code: 'refresh_replay',
        message: 'Refresh token replay detected'
      });
    }
    const now = new Date().toISOString();
    activeSession.consumedAt = now;
    activeSession.rotatedAt = now;
    activeSession.revokedAt = now;
    activeSession.revokeReason = 'rotated';
    return activeSession;
  }

  private revokeFamilyInMemory(tenantId: string, rootJti: string, reason: string): void {
    const family = new Set<string>([rootJti]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const session of this.sessions) {
        if (
          session.tenantId === tenantId &&
          session.parentJti &&
          family.has(session.parentJti) &&
          !family.has(session.jti)
        ) {
          family.add(session.jti);
          changed = true;
        }
      }
    }

    const now = new Date().toISOString();
    this.sessions = this.sessions.map((session) => {
      if (session.tenantId !== tenantId || !family.has(session.jti)) {
        return session;
      }
      return {
        ...session,
        revokedAt: session.revokedAt ?? now,
        revokeReason: session.revokeReason ?? reason
      };
    });
  }

  private async revokeSessionInternal(
    sessionId: string,
    tenantId: string,
    userId: string
  ): Promise<void> {
    if (!this.databaseService) {
      this.sessions = this.sessions.map((session) => {
        if (
          session.id === sessionId &&
          session.tenantId === tenantId &&
          session.userId === userId
        ) {
          return { ...session, revokedAt: new Date().toISOString() };
        }
        return session;
      });
      return;
    }

    await this.databaseService.query(
      `
        update iam.sessions
        set revoked_at = now(), updated_at = now()
        where id = $1 and tenant_id = $2 and user_id = $3 and revoked_at is null
      `,
      [sessionId, tenantId, userId]
    );
    this.sessions = this.sessions.map((session) => {
      if (session.id === sessionId && session.tenantId === tenantId && session.userId === userId) {
        return { ...session, revokedAt: new Date().toISOString() };
      }
      return session;
    });
  }

  private async revokeAllSessionsForUserInternal(tenantId: string, userId: string): Promise<void> {
    if (this.databaseService) {
      await this.databaseService.query(
        `
          update iam.sessions
          set revoked_at = now(), updated_at = now()
          where tenant_id = $1 and user_id = $2 and revoked_at is null
        `,
        [tenantId, userId]
      );
    }

    this.sessions = this.sessions.map((session) => {
      if (session.tenantId === tenantId && session.userId === userId && !session.revokedAt) {
        return { ...session, revokedAt: new Date().toISOString() };
      }
      return session;
    });
  }

  private hashSessionToken(token: string): string {
    return hashRefreshToken(token, this.secretsService.getJwtSigningSecret());
  }

  private hashCsrfToken(csrfToken: string): string {
    return this.hashSessionToken(`csrf:${csrfToken}`);
  }
}
