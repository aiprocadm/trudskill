import { BadRequestException, Inject, Injectable, Logger, Optional } from '@nestjs/common';

import { AuditService } from '../../audit/audit.service.js';
import {
  DEFAULT_RECOVERY_THROTTLE,
  RECOVERY_THROTTLE_SETTINGS_KEY,
  resolveRecoveryThrottle
} from '../../iam/recovery-throttle.js';
import { IamService } from '../../iam/services/iam.service.js';
import {
  LoggingMagicLinkEmailSender,
  MAGIC_LINK_EMAIL_SENDER,
  type MagicLinkEmailSender
} from '../../iam/services/magic-link-email-sender.js';
import { MagicLinkService } from '../../iam/services/magic-link.service.js';
import { TenantService } from '../../tenant/tenant.service.js';
import { MvpService } from '../mvp.service.js';

import type { RequestContext } from '../../../common/context/request-context.js';

export interface LearnerAccessOutcome {
  /** Как у приглашения сотрудника: письмо ушло / предел запросов / почта стенда выключена. */
  status: 'sent' | 'throttled' | 'logged';
  userId: string;
  /** Учётка привязана к слушателю этим действием (раньше входа в кабинет не было). */
  linked: boolean;
}

/** Роль кабинета слушателя (0038); без неё учётка входит, но ничего не видит. */
const LEARNER_ROLE = 'learner';

/**
 * «Выслать доступ» (ТЗ перехода §6.4 МГ-C2.1; срез 9.3, РМ97–РМ99): письмо со ссылкой для
 * входа слушателю тем же механизмом, что у приглашения сотрудника (`POST users/invite`):
 * учётка по почте (создаётся, если нет), привязка к слушателю, роль `learner`, ссылка через
 * `MagicLinkService` с пределом центра. Письмо о зачислении ведёт на общую страницу входа без
 * токена — этого «доступа» человеку не хватало (журнал 642).
 */
@Injectable()
export class LearnerAccessService {
  private readonly logger = new Logger(LearnerAccessService.name);

  constructor(
    @Inject(MvpService) private readonly mvp: MvpService,
    @Inject(IamService) private readonly iam: IamService,
    @Inject(MagicLinkService) private readonly magicLinks: MagicLinkService,
    @Inject(MAGIC_LINK_EMAIL_SENDER) private readonly sender: MagicLinkEmailSender,
    @Inject(AuditService) private readonly audit: AuditService,
    @Optional() @Inject(TenantService) private readonly tenants?: TenantService
  ) {}

  async send(
    tenantId: string,
    learnerId: string,
    actorId: string | undefined,
    ctx: RequestContext
  ): Promise<LearnerAccessOutcome> {
    const learner = this.mvp.getLearner(tenantId, learnerId);
    const email = learner.email?.trim().toLowerCase();
    if (!email) {
      throw new BadRequestException({
        code: 'learner_no_email',
        message: 'У слушателя не указана почта — добавьте её в личном деле и вышлите доступ снова.'
      });
    }

    /* Учётка по почте — одна на человека: повторная отправка не плодит пользователей (РМ97). */
    const { user } = await this.iam.findOrCreateByEmail(tenantId, email);
    const linked = !learner.linkedIamUserId;
    if (linked) this.mvp.linkLearnerToIamUser(tenantId, learnerId, user.id);
    await this.ensureLearnerRole(tenantId, user.id, actorId, ctx);

    const { rawToken } = await this.magicLinks.requestLink({
      tenantId,
      email,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      throttle: await this.throttleFor(tenantId)
    });
    let status: LearnerAccessOutcome['status'] = 'throttled';
    if (rawToken) {
      const tenantName = await this.tenantName(tenantId);
      await this.sender.sendMagicLink({
        email,
        rawToken,
        ...(tenantName ? { tenantName } : {})
      });
      status = this.sender instanceof LoggingMagicLinkEmailSender ? 'logged' : 'sent';
    }

    /* В аудите — исход и учётка, но не почта: адрес и так виден в карточке под своим правом. */
    this.audit.write({
      tenantId,
      ...(actorId ? { actorId } : {}),
      action: 'learning.learner_access_sent',
      entityType: 'learning.learner',
      entityId: learnerId,
      newValues: { status, userId: user.id, linked },
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
      userAgent: ctx.userAgent
    });
    return { status, userId: user.id, linked };
  }

  /** Роль кабинета — только если ролей нет вовсе: сотруднику с почтой слушателя роли не трогаем (РМ98). */
  private async ensureLearnerRole(
    tenantId: string,
    userId: string,
    actorId: string | undefined,
    ctx: RequestContext
  ): Promise<void> {
    const roles = await this.iam.getUserRoles(tenantId, userId);
    if (roles.length > 0) return;
    try {
      await this.iam.setUserRoles(
        tenantId,
        userId,
        [LEARNER_ROLE],
        actorId,
        ctx.requestId,
        ctx.correlationId
      );
    } catch (error: unknown) {
      /* Роли `learner` может не быть в стенде без базы — ссылку всё равно шлём, вход не ломаем. */
      this.logger.warn(
        `learner role not assigned tenant=${tenantId} user=${userId}: ${String(error)}`
      );
    }
  }

  private async throttleFor(tenantId: string) {
    if (!this.tenants) return DEFAULT_RECOVERY_THROTTLE;
    try {
      const stored = await this.tenants.getSettings(tenantId);
      return resolveRecoveryThrottle(stored.payload[RECOVERY_THROTTLE_SETTINGS_KEY]);
    } catch {
      /* Настроек у центра может не быть — действуют умолчания. */
      return DEFAULT_RECOVERY_THROTTLE;
    }
  }

  private async tenantName(tenantId: string): Promise<string | undefined> {
    if (!this.tenants) return undefined;
    try {
      return (await this.tenants.getTenantById(tenantId)).name;
    } catch {
      /* Имя центра — украшение письма; без него письмо всё равно уходит. */
      return undefined;
    }
  }
}
