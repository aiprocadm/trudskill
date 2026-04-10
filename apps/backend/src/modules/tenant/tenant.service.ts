import { Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';

import { DatabaseService } from '../../infrastructure/database/database.service.js';
import { TenantScopedRepository } from '../../infrastructure/database/tenant-repository.js';

import type {
  CommissionMember,
  Tenant,
  TenantCommission,
  TenantRequisites,
  TenantSettings
} from './tenant.types.js';

@Injectable()
export class TenantService {
  private readonly tenants: Tenant[] = [
    { id: 'tenant_demo', code: 'demo', name: 'Demo Tenant', status: 'active' }
  ];

  private readonly settings: TenantSettings[] = [
    {
      tenantId: 'tenant_demo',
      locale: 'ru-RU',
      timezone: 'Europe/Moscow',
      payload: { academyName: 'Demo Academy' }
    }
  ];

  private readonly requisites: TenantRequisites[] = [
    {
      tenantId: 'tenant_demo',
      legalName: 'ООО Демо Академия',
      taxNumber: '7700000000',
      payload: { address: 'Москва' }
    }
  ];

  private readonly commissions = new Map<string, TenantCommission>();

  constructor(
    @Inject(TenantScopedRepository) private readonly tenantScopedRepository: TenantScopedRepository,
    @Optional() @Inject(DatabaseService) private readonly databaseService?: DatabaseService
  ) {}

  async getTenantById(tenantId: string): Promise<Tenant> {
    if (this.databaseService) {
      const rows = await this.databaseService.query<{
        id: string;
        code: string;
        name: string;
        status: 'active' | 'suspended';
      }>('select id, code, name, status from core.tenants where id = $1', [tenantId]);
      const tenant = rows[0];
      if (!tenant) {
        throw new NotFoundException({ code: 'tenant_not_found', message: 'Tenant not found' });
      }
      return tenant;
    }

    const tenant = this.tenants.find((item) => item.id === tenantId);
    if (!tenant) {
      throw new NotFoundException({ code: 'tenant_not_found', message: 'Tenant not found' });
    }

    return tenant;
  }

  async getSettings(tenantId: string): Promise<TenantSettings> {
    if (this.databaseService) {
      const rows = await this.databaseService.query<{
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

    const settings = this.settings.find((item) => item.tenantId === tenantId);
    if (!settings) {
      throw new NotFoundException({
        code: 'tenant_settings_not_found',
        message: 'Tenant settings not found'
      });
    }

    this.tenantScopedRepository.enforceTenantScope(tenantId, settings.tenantId);
    return settings;
  }

  async getRequisites(tenantId: string): Promise<TenantRequisites> {
    if (this.databaseService) {
      const rows = await this.databaseService.query<{
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

    const requisites = this.requisites.find((item) => item.tenantId === tenantId);
    if (!requisites) {
      throw new NotFoundException({
        code: 'tenant_requisites_not_found',
        message: 'Tenant requisites not found'
      });
    }

    this.tenantScopedRepository.enforceTenantScope(tenantId, requisites.tenantId);
    return requisites;
  }

  async getCommission(tenantId: string): Promise<TenantCommission> {
    const cached = this.commissions.get(tenantId);
    if (cached) {
      this.tenantScopedRepository.enforceTenantScope(tenantId, cached.tenantId);
      return cached;
    }

    if (this.databaseService) {
      const empty: TenantCommission = { tenantId, members: [] };
      this.commissions.set(tenantId, empty);
      return empty;
    }

    const demoMembers: CommissionMember[] = [
      {
        id: 'cm_demo_1',
        tenantId,
        displayName: 'Иванов И.И.',
        position: 'Председатель (пример)',
        userId: 'u_tenant_admin'
      },
      { id: 'cm_demo_2', tenantId, displayName: 'Петров П.П.', position: 'Член комиссии (пример)' }
    ];
    const commission: TenantCommission = {
      tenantId,
      chairMemberId: 'cm_demo_1',
      secretaryMemberId: 'cm_demo_2',
      members: demoMembers
    };
    this.commissions.set(tenantId, commission);
    this.tenantScopedRepository.enforceTenantScope(tenantId, commission.tenantId);
    return commission;
  }
}
