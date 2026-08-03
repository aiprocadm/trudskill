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
    @Inject(AuditService) private readonly auditService: AuditService
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

  async listTenants(): Promise<Tenant[]> {
    return this.requireDb().query<Tenant>(
      'select id, code, name, status from core.tenants order by created_at desc, id'
    );
  }

  /**
   * Создание арендатора. Новый тенант получает клон ролей тенанта платформы
   * (tenant_admin, manager, methodist, learner, counterparty_rep, ...) вместе с их
   * правами — одним атомарным SQL, чтобы не оставить тенант без ролей при сбое между
   * запросами. platform_admin НЕ клонируется: платформенная роль существует только
   * у владельца платформы, иначе каждый арендатор получал бы админку всех остальных.
   */
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
}
