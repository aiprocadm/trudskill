import { randomUUID } from 'node:crypto';

import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException
} from '@nestjs/common';

import { DatabaseService } from '../../infrastructure/database/database.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AuthService } from '../iam/services/auth.service.js';

import type { RequestContext } from '../../common/context/request-context.js';
import type { Tenant, TenantStatus } from '../tenant/tenant.types.js';

/**
 * ФТ-D2.2 (Фаза 4 Task 3): платформенная админка тенантов. Кросс-тенантный по своей
 * природе модуль: единственный в системе, кому положено видеть ВСЕ тенанты. Поэтому
 * доступ к нему — отдельные права `platform.tenants.read|write` (миграция 0073),
 * выданные ТОЛЬКО роли platform_admin; tenant_admin арендатора их не имеет.
 */
@Injectable()
export class PlatformTenantsService {
  constructor(
    @Optional()
    @Inject(DatabaseService)
    private readonly databaseService: DatabaseService | undefined,
    @Inject(AuditService) private readonly auditService: AuditService,
    @Inject(AuthService) private readonly authService: AuthService
  ) {}

  /** Как в TenantService (ФТ-D2.1): без БД тенантов не существует — 503, а не выдумка. */
  private requireDb(): DatabaseService {
    if (!this.databaseService) {
      throw new ServiceUnavailableException({
        code: 'tenant_store_unavailable',
        message: 'Tenant store (database) is not available'
      });
    }
    return this.databaseService;
  }

  /**
   * Список арендаторов с назначенным тарифом.
   *
   * Тариф добавлен в ответ по журналу расхождений (запись 87): назначение тарифа делается
   * на этом же экране, а увидеть назначенное было нельзя — администратор платформы не знал
   * лимитов центра, пока не откроет форму назначения. Поле аддитивное: прежние читатели
   * ответа его просто не замечают.
   *
   * Присоединение — левое: тариф может быть не назначен вовсе (тогда лимитов нет), и такой
   * центр обязан остаться в списке.
   */
  async listTenants(): Promise<Array<Tenant & { planName: string | null }>> {
    return this.requireDb().query<Tenant & { planName: string | null }>(
      `select t.id, t.code, t.name, t.status, p.name as "planName"
         from core.tenants t
         left join core.tenant_subscriptions s
           on s.tenant_id = t.id and s.status = 'active'
         left join core.plans p on p.id = s.plan_id
        order by t.created_at desc, t.id`
    );
  }

  /**
   * Создание арендатора. Новый тенант получает клон ролей тенанта платформы
   * (tenant_admin, manager, methodist, learner, counterparty_rep, ...) вместе с их
   * правами — одним атомарным SQL, чтобы не оставить тенант без ролей при сбое между
   * запросами. platform_admin НЕ клонируется: платформенная роль существует только
   * у владельца платформы, иначе каждый арендатор получал бы админку всех остальных.
   */
  /**
   * ФТ-D3.2: публичный резолв по коду из поддомена — нужен ДО входа, на странице логина.
   * Отдаёт только то, что и так видно на странице входа. Архивный НЕ отдаётся вовсе:
   * офбординг означает, что центра больше нет, и подтверждать посторонним «он тут был»
   * незачем; приостановленный отдаётся со статусом — его слушателям нужна причина.
   */
  async findPublicByCode(
    code: string
  ): Promise<{ id: string; code: string; name: string; status: TenantStatus } | null> {
    if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(code)) return null;
    const rows = await this.requireDb().query<Tenant>(
      `select id, code, name, status from core.tenants
       where code = $1 and status <> 'archived'`,
      [code]
    );
    return rows[0] ?? null;
  }

  async createTenant(
    actorId: string | undefined,
    request: { code: string; name: string; status?: TenantStatus },
    context: RequestContext
  ): Promise<Tenant> {
    const db = this.requireDb();
    const code = request.code.trim();
    const name = request.name.trim();
    const status: TenantStatus = request.status ?? 'trial';

    const duplicates = await db.query<{ id: string }>(
      'select id from core.tenants where code = $1',
      [code]
    );
    if (duplicates.length > 0) {
      throw new ConflictException({
        code: 'tenant_code_taken',
        message: 'Tenant with this code already exists'
      });
    }

    const id = `t_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
    await db.query(
      `with new_tenant as (
         insert into core.tenants (id, code, name, status)
         values ($1, $2, $3, $4)
       ),
       new_roles as (
         insert into iam.roles (id, tenant_id, code, name)
         select concat('r_', $1::text, '_', r.code), $1, r.code, r.name
         from iam.roles r
         where r.tenant_id = $5 and r.code <> 'platform_admin'
         returning id, code
       )
       insert into iam.role_permissions (id, tenant_id, role_id, permission_id)
       select concat('rp_', nr.id, '_', rp.permission_id), $1, nr.id, rp.permission_id
       from new_roles nr
       join iam.roles src on src.tenant_id = $5 and src.code = nr.code
       join iam.role_permissions rp on rp.tenant_id = $5 and rp.role_id = src.id`,
      [id, code, name, status, context.tenantId]
    );

    const tenant: Tenant = { id, code, name, status };
    await this.auditService.writeCritical({
      tenantId: id,
      actorId,
      action: 'platform.tenant_created',
      entityType: 'core.tenant',
      entityId: id,
      newValues: tenant as unknown as Record<string, unknown>,
      requestId: context.requestId,
      correlationId: context.correlationId
    });
    return tenant;
  }

  async changeStatus(
    actorId: string | undefined,
    tenantId: string,
    status: TenantStatus,
    context: RequestContext
  ): Promise<Tenant> {
    const db = this.requireDb();
    const rows = await db.query<Tenant>(
      'select id, code, name, status from core.tenants where id = $1',
      [tenantId]
    );
    const current = rows[0];
    if (!current) {
      throw new NotFoundException({ code: 'tenant_not_found', message: 'Tenant not found' });
    }

    await db.query('update core.tenants set status = $2, updated_at = now() where id = $1', [
      tenantId,
      status
    ]);

    const updated: Tenant = { ...current, status };
    // Смена статуса — критичная запись: suspended отключает арендатора, и по журналу
    // должно быть видно, кто и когда это сделал.
    await this.auditService.writeCritical({
      tenantId,
      actorId,
      action: 'platform.tenant_status_changed',
      entityType: 'core.tenant',
      entityId: tenantId,
      oldValues: current as unknown as Record<string, unknown>,
      newValues: updated as unknown as Record<string, unknown>,
      requestId: context.requestId,
      correlationId: context.correlationId
    });
    return updated;
  }

  /**
   * Вход «от имени» (ФТ-D2.2). Именно запись в аудите отличает поддержку от
   * злоупотребления, поэтому она пишется `writeCritical` ДО выдачи сессии — сбой
   * журнала отменяет вход. Лучше след без входа, чем вход без следа (падение после
   * записи оставит запись без сессии — это осознанная асимметрия).
   *
   * Цель по умолчанию — активный tenant_admin арендатора: поддержка входит «как
   * администратор центра», конкретного сотрудника указывают явно.
   */
  async impersonate(
    actorId: string | undefined,
    tenantId: string,
    requestedUserId: string | undefined,
    context: RequestContext
  ) {
    const db = this.requireDb();
    const tenants = await db.query<Tenant>(
      'select id, code, name, status from core.tenants where id = $1',
      [tenantId]
    );
    const tenant = tenants[0];
    if (!tenant) {
      throw new NotFoundException({ code: 'tenant_not_found', message: 'Tenant not found' });
    }
    if (tenant.status === 'archived') {
      // Офбординг замораживает кабинет: входить «от имени» в архив нельзя даже поддержке.
      throw new ConflictException({
        code: 'tenant_archived',
        message: 'Tenant is archived; impersonation is not allowed'
      });
    }

    let targetUserId = requestedUserId;
    if (!targetUserId) {
      const admins = await db.query<{ id: string }>(
        `select u.id
         from iam.users u
         join iam.user_roles ur on ur.tenant_id = u.tenant_id and ur.user_id = u.id
         join iam.roles r on r.tenant_id = ur.tenant_id and r.id = ur.role_id
         where u.tenant_id = $1 and r.code = 'tenant_admin' and u.status = 'active'
         order by u.id
         limit 1`,
        [tenantId]
      );
      targetUserId = admins[0]?.id;
    }
    if (!targetUserId) {
      throw new NotFoundException({
        code: 'impersonation_target_not_found',
        message: 'No active tenant_admin to impersonate; specify userId explicitly'
      });
    }

    await this.auditService.writeCritical({
      tenantId,
      actorId,
      action: 'platform.impersonation_started',
      entityType: 'iam.user',
      entityId: targetUserId,
      metadata: {
        impersonation: true,
        platformActorId: actorId,
        platformTenantId: context.tenantId
      },
      requestId: context.requestId,
      correlationId: context.correlationId,
      ip: context.ip,
      userAgent: context.userAgent
    });

    const session = await this.authService.issueImpersonatedSession(tenantId, targetUserId);
    return { tenantId, userId: targetUserId, session };
  }
}
