import {
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException
} from '@nestjs/common';

import { DatabaseService } from '../../infrastructure/database/database.service.js';
import { TenantScopedRepository } from '../../infrastructure/database/tenant-repository.js';

import type {
  Tenant,
  TenantCommission,
  TenantRequisites,
  TenantSettings,
  TenantStatus
} from './tenant.types.js';

/**
 * ФТ-D2.1 (Фаза 4 Task 2): единственный источник тенантов — БД. In-memory фоллбека
 * `tenant_demo` больше нет: платформа сдаётся в аренду, и «знать» тенанта, которого нет
 * в базе, означало бы подменять арендатора демо-данными при любом сбое конфигурации.
 * Без БД сервис отвечает честной недоступностью, а не выдуманными данными.
 */
@Injectable()
export class TenantService {
  private readonly commissions = new Map<string, TenantCommission>();

  constructor(
    @Inject(TenantScopedRepository) private readonly tenantScopedRepository: TenantScopedRepository,
    @Optional() @Inject(DatabaseService) private readonly databaseService?: DatabaseService
  ) {}

  /** Фейл-клоузед: без БД тенантов НЕ СУЩЕСТВУЕТ — понятная 503, а не демо-подмена. */
  private requireDb(): DatabaseService {
    if (!this.databaseService) {
      throw new ServiceUnavailableException({
        code: 'tenant_store_unavailable',
        message: 'Tenant store (database) is not available'
      });
    }
    return this.databaseService;
  }

  async getTenantById(tenantId: string): Promise<Tenant> {
    const rows = await this.requireDb().query<{
      id: string;
      code: string;
      name: string;
      status: TenantStatus;
    }>('select id, code, name, status from core.tenants where id = $1', [tenantId]);
    const tenant = rows[0];
    if (!tenant) {
      throw new NotFoundException({ code: 'tenant_not_found', message: 'Tenant not found' });
    }
    return tenant;
  }

  async getSettings(tenantId: string): Promise<TenantSettings> {
    const rows = await this.requireDb().query<{
      tenant_id: string;
      payload: Record<string, unknown>;
    }>('select tenant_id, payload from org.tenant_settings where tenant_id = $1', [tenantId]);
    const settingsRow = rows[0];
    if (!settingsRow) {
      throw new NotFoundException({
        code: 'tenant_settings_not_found',
        message: 'Tenant settings not found'
      });
    }

    this.tenantScopedRepository.enforceTenantScope(tenantId, settingsRow.tenant_id);
    const payload = settingsRow.payload ?? {};
    return {
      tenantId: settingsRow.tenant_id,
      locale: typeof payload.locale === 'string' ? payload.locale : 'ru-RU',
      timezone: typeof payload.timezone === 'string' ? payload.timezone : 'Europe/Moscow',
      payload
    };
  }

  async getRequisites(tenantId: string): Promise<TenantRequisites> {
    const rows = await this.requireDb().query<{
      tenant_id: string;
      legal_name: string;
      tax_number: string;
      payload: Record<string, unknown>;
    }>(
      'select tenant_id, legal_name, tax_number, payload from org.tenant_requisites where tenant_id = $1',
      [tenantId]
    );

    const requisitesRow = rows[0];
    if (!requisitesRow) {
      throw new NotFoundException({
        code: 'tenant_requisites_not_found',
        message: 'Tenant requisites not found'
      });
    }

    this.tenantScopedRepository.enforceTenantScope(tenantId, requisitesRow.tenant_id);
    return {
      tenantId: requisitesRow.tenant_id,
      legalName: requisitesRow.legal_name,
      taxNumber: requisitesRow.tax_number,
      payload: requisitesRow.payload ?? {}
    };
  }

  async updateSettings(
    tenantId: string,
    patch: { locale?: string; timezone?: string; payload?: Record<string, unknown> }
  ): Promise<TenantSettings> {
    const db = this.requireDb();
    const current = await this.getSettings(tenantId);
    const next: TenantSettings = {
      tenantId,
      locale: patch.locale ?? current.locale,
      timezone: patch.timezone ?? current.timezone,
      payload: { ...current.payload, ...(patch.payload ?? {}) }
    };
    await db.query(
      `insert into org.tenant_settings (tenant_id, payload)
       values ($1, $2::jsonb)
       on conflict (tenant_id) do update set payload = excluded.payload`,
      [tenantId, JSON.stringify({ ...next.payload, locale: next.locale, timezone: next.timezone })]
    );
    return this.getSettings(tenantId);
  }

  async updateRequisites(
    tenantId: string,
    patch: { legalName?: string; taxNumber?: string; payload?: Record<string, unknown> }
  ): Promise<TenantRequisites> {
    const db = this.requireDb();
    const current = await this.getRequisites(tenantId);
    const next: TenantRequisites = {
      tenantId,
      legalName: patch.legalName ?? current.legalName,
      taxNumber: patch.taxNumber ?? current.taxNumber,
      payload: { ...current.payload, ...(patch.payload ?? {}) }
    };
    await db.query(
      `insert into org.tenant_requisites (tenant_id, legal_name, tax_number, payload)
       values ($1, $2, $3, $4::jsonb)
       on conflict (tenant_id)
       do update set legal_name = excluded.legal_name, tax_number = excluded.tax_number, payload = excluded.payload`,
      [tenantId, next.legalName, next.taxNumber, JSON.stringify(next.payload)]
    );
    return this.getRequisites(tenantId);
  }

  /**
   * Тенанты, у которых обучение идёт, — для ночных кросс-тенантных сканов (Plan 5B-2).
   * `trial` включён: пробный центр реально учится и должен получать напоминания;
   * `suspended`/`archived` исключены — неоплата и офбординг останавливают рассылки.
   */
  async listActiveTenantIds(): Promise<string[]> {
    const rows = await this.requireDb().query<{ id: string }>(
      "select id from core.tenants where status in ('trial', 'active') order by id"
    );
    return rows.map((r) => r.id);
  }

  async getCommission(tenantId: string): Promise<TenantCommission> {
    this.requireDb();
    const cached = this.commissions.get(tenantId);
    if (cached) {
      this.tenantScopedRepository.enforceTenantScope(tenantId, cached.tenantId);
      return cached;
    }
    // Демо-состава «Иванов/Петров» больше нет: пустая комиссия — честное состояние
    // нового центра, состав заводится мастером онбординга (ФТ-D2.3).
    const empty: TenantCommission = { tenantId, members: [] };
    this.commissions.set(tenantId, empty);
    return empty;
  }
}
