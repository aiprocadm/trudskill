import { Injectable, NotFoundException } from '@nestjs/common';
import { TenantScopedRepository } from '../../infrastructure/database/tenant-repository.js';
import type { Tenant, TenantRequisites, TenantSettings } from './tenant.types.js';

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

  constructor(private readonly tenantScopedRepository: TenantScopedRepository) {}

  getTenantById(tenantId: string): Tenant {
    const tenant = this.tenants.find((item) => item.id === tenantId);
    if (!tenant) {
      throw new NotFoundException({ code: 'tenant_not_found', message: 'Tenant not found' });
    }

    return tenant;
  }

  getSettings(tenantId: string): TenantSettings {
    const settings = this.settings.find((item) => item.tenantId === tenantId);
    if (!settings) {
      throw new NotFoundException({ code: 'tenant_settings_not_found', message: 'Tenant settings not found' });
    }

    this.tenantScopedRepository.enforceTenantScope(tenantId, settings.tenantId);
    return settings;
  }

  getRequisites(tenantId: string): TenantRequisites {
    const requisites = this.requisites.find((item) => item.tenantId === tenantId);
    if (!requisites) {
      throw new NotFoundException({ code: 'tenant_requisites_not_found', message: 'Tenant requisites not found' });
    }

    this.tenantScopedRepository.enforceTenantScope(tenantId, requisites.tenantId);
    return requisites;
  }
}
