import { Injectable } from '@nestjs/common';

import type { LicensesRepository } from './licenses.repository.js';
import type { LicenseStatus, TrainingLicense } from './licenses.types.js';

/**
 * In-memory `LicensesRepository` for unit tests and DB-less dev. Singleton (NOT
 * `Scope.REQUEST`) so licenses persist between requests, mirroring the postgres impl.
 * Stores and returns copies so callers must go through `update()` to persist a change.
 */
@Injectable()
export class InMemoryLicensesRepository implements LicensesRepository {
  private readonly licenses: TrainingLicense[] = [];

  private clone(l: TrainingLicense): TrainingLicense {
    return { ...l };
  }

  async list(tenantId: string, status?: LicenseStatus): Promise<TrainingLicense[]> {
    return this.licenses
      .filter((l) => l.tenantId === tenantId && (!status || l.status === status))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .map((l) => this.clone(l));
  }

  async getById(tenantId: string, id: string): Promise<TrainingLicense | null> {
    const found = this.licenses.find((l) => l.tenantId === tenantId && l.id === id);
    return found ? this.clone(found) : null;
  }

  async findByTypeAndNumber(
    tenantId: string,
    licenseType: string,
    licenseNumber: string
  ): Promise<TrainingLicense | null> {
    const found = this.licenses.find(
      (l) =>
        l.tenantId === tenantId &&
        l.licenseType === licenseType &&
        l.licenseNumber === licenseNumber
    );
    return found ? this.clone(found) : null;
  }

  async insert(license: TrainingLicense): Promise<TrainingLicense> {
    this.licenses.push(this.clone(license));
    return this.clone(license);
  }

  async update(license: TrainingLicense): Promise<TrainingLicense> {
    const index = this.licenses.findIndex(
      (l) => l.tenantId === license.tenantId && l.id === license.id
    );
    if (index >= 0) this.licenses[index] = this.clone(license);
    return this.clone(license);
  }

  async findActiveExpiringBefore(
    tenantId: string,
    dateInclusive: string
  ): Promise<TrainingLicense[]> {
    return this.licenses
      .filter(
        (l) =>
          l.tenantId === tenantId &&
          l.status === 'active' &&
          !!l.validUntil &&
          l.validUntil <= dateInclusive
      )
      .sort((a, b) => (a.validUntil ?? '').localeCompare(b.validUntil ?? ''))
      .map((l) => this.clone(l));
  }
}
