import type { LicenseStatus, TrainingLicense } from './licenses.types.js';

export const LICENSES_REPOSITORY = Symbol('LICENSES_REPOSITORY');

/**
 * Durable persistence seam for training licenses (Pillar A §5.10).
 *
 * Before this seam the `LicensesService` mutated a `Scope.REQUEST` in-memory array
 * (`InMemoryOrgState`) — licenses were lost between HTTP requests and the
 * `org.training_licenses` table (migration 0035) sat unused. The repository wires the
 * service to that table so (a) licenses actually persist and the publish-time license
 * gate works across requests, and (b) the nightly `license_expiring` cron can scan
 * `valid_until` cross-tenant. Mirrors the recertification-drafts repo pattern
 * (token + in-memory impl for tests + postgres impl for prod).
 */
export interface LicensesRepository {
  list(tenantId: string, status?: LicenseStatus): Promise<TrainingLicense[]>;
  getById(tenantId: string, id: string): Promise<TrainingLicense | null>;
  findByTypeAndNumber(
    tenantId: string,
    licenseType: string,
    licenseNumber: string
  ): Promise<TrainingLicense | null>;
  insert(license: TrainingLicense): Promise<TrainingLicense>;
  update(license: TrainingLicense): Promise<TrainingLicense>;
  /**
   * Active licenses with a `validUntil` at or before `dateInclusive` (YYYY-MM-DD),
   * for the expiry scanner. Indefinite (no `validUntil`) licenses are excluded.
   */
  findActiveExpiringBefore(tenantId: string, dateInclusive: string): Promise<TrainingLicense[]>;
}
