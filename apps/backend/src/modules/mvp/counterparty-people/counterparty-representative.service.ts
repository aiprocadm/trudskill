import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional
} from '@nestjs/common';

import {
  COUNTERPARTY_PEOPLE_REPOSITORY,
  type CounterpartyPeopleRepository
} from './counterparty-people.repository.js';
import { CounterpartyPeopleService } from './counterparty-people.service.js';
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

import type { CounterpartyContact } from './counterparty-people.types.js';
import type { RequestContext } from '../../../common/context/request-context.js';

export interface RepresentativeInviteOutcome {
  /** `sent` — письмо ушло; `logged` — почта стенда выключена, ссылка в журнале; `throttled` — недавно уже слали. */
  status: 'sent' | 'throttled' | 'logged';
  userId: string;
  contact: CounterpartyContact;
}

/** Роли, с которыми человека можно сделать представителем: сам представитель и слушатель. */
const COMPATIBLE_ROLES = new Set(['counterparty_rep', 'learner']);

/**
 * «Пригласить в портал» (МГ-D2.1, срез 14.3): контакт компании получает вход в портал
 * заказчика — учётную запись по почте, привязку к компании и роль представителя ОДНОЙ
 * транзакцией (журнал 647: роль без привязки — это портал всего центра), затем письмо входа.
 *
 * Сотрудника центра представителем не сделать: привязка к компании ограничила бы ему весь
 * центр одной компанией. Человек другой компании — тоже отказ, а не тихая перепривязка.
 */
@Injectable()
export class CounterpartyRepresentativeService {
  constructor(
    @Inject(CounterpartyPeopleService) private readonly people: CounterpartyPeopleService,
    @Inject(COUNTERPARTY_PEOPLE_REPOSITORY) private readonly repo: CounterpartyPeopleRepository,
    @Inject(IamService) private readonly iam: IamService,
    @Inject(MagicLinkService) private readonly magicLinks: MagicLinkService,
    @Inject(MAGIC_LINK_EMAIL_SENDER) private readonly sender: MagicLinkEmailSender,
    @Inject(AuditService) private readonly audit: AuditService,
    @Optional() @Inject(TenantService) private readonly tenants?: TenantService
  ) {}

  async invite(
    tenantId: string,
    counterpartyId: string,
    contactId: string,
    ctx: RequestContext
  ): Promise<RepresentativeInviteOutcome> {
    const counterparty = this.people.requireCounterparty(tenantId, counterpartyId, ctx);
    const contact = await this.repo.getContact(tenantId, counterpartyId, contactId);
    if (!contact) {
      throw new NotFoundException({ code: 'not_found', message: 'Контакт не найден' });
    }
    if (contact.status !== 'active') {
      throw new BadRequestException({
        code: 'contact_archived',
        message: 'Контакт в архиве — верните его из архива, чтобы пригласить в портал.'
      });
    }
    const email = contact.email?.trim().toLowerCase();
    if (!email) {
      throw new BadRequestException({
        code: 'contact_no_email',
        message: 'У контакта нет почты — добавьте её, чтобы выслать приглашение.'
      });
    }

    const { user } = await this.iam.findOrCreateByEmail(tenantId, email);
    const roles = await this.iam.getUserRoles(tenantId, user.id);
    if (roles.some((role) => !COMPATIBLE_ROLES.has(role.code))) {
      throw new ConflictException({
        code: 'contact_user_is_staff',
        message:
          'Эта почта принадлежит сотруднику центра — представителем заказчика его не сделать.'
      });
    }
    const current = await this.iam.getUser(tenantId, user.id);
    if (current.counterpartyId && current.counterpartyId !== counterpartyId) {
      throw new ConflictException({
        code: 'contact_user_other_company',
        message: 'Эта почта уже привязана к другой компании-заказчику.'
      });
    }

    // Строка компании в `crm.counterparties` — до привязки: на неё ссылается `iam.users` (0071).
    await this.repo.ensureCounterparty(tenantId, counterparty);
    await this.iam.linkRepresentative(tenantId, user.id, counterpartyId);
    const invited: CounterpartyContact = {
      ...contact,
      userId: user.id,
      updatedAt: new Date().toISOString()
    };
    await this.repo.saveContact(tenantId, counterparty, invited);

    const { rawToken } = await this.magicLinks.requestLink({
      tenantId,
      email,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      throttle: await this.throttleFor(tenantId)
    });
    let status: RepresentativeInviteOutcome['status'] = 'throttled';
    if (rawToken) {
      const tenantName = await this.tenantName(tenantId);
      await this.sender.sendMagicLink({ email, rawToken, ...(tenantName ? { tenantName } : {}) });
      status = this.sender instanceof LoggingMagicLinkEmailSender ? 'logged' : 'sent';
    }

    /* В аудите — исход и учётка, но не почта: адрес виден в карточке под своим правом. */
    this.audit.write({
      tenantId,
      ...(ctx.userId ? { actorId: ctx.userId } : {}),
      action: 'crm.counterparty_contact_invited',
      entityType: 'crm.counterparty_contact',
      entityId: contact.id,
      newValues: { counterpartyId, status, userId: user.id },
      requestId: ctx.requestId,
      correlationId: ctx.correlationId,
      ip: ctx.ip,
      userAgent: ctx.userAgent
    });
    return { status, userId: user.id, contact: invited };
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
