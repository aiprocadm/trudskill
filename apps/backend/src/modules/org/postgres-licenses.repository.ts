import { Inject, Injectable } from '@nestjs/common';

import { DatabaseService } from '../../infrastructure/database/database.service.js';

import type { LicensesRepository } from './licenses.repository.js';
import type { LicenseStatus, LicenseType, TrainingLicense } from './licenses.types.js';

interface LicenseDbRow {
  id: string;
  tenant_id: string;
  license_type: string;
  license_number: string;
  issuer_name: string;
  issued_at: string;
  valid_until: string | null;
  scan_file_id: string | null;
  permitted_training_types: string[] | null;
  permitted_directions: string[] | null;
  status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Postgres-backed `LicensesRepository` on `org.training_licenses` (migration 0035).
 * Date columns are cast to text in SELECTs so `validUntil`/`issuedAt` are canonical
 * `YYYY-MM-DD` strings (node-pg parses `date` to a JS Date by default, which would
 * break the string-based expiry comparison).
 */
@Injectable()
export class PostgresLicensesRepository implements LicensesRepository {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  private readonly columns = `id, tenant_id, license_type, license_number, issuer_name,
    issued_at::text as issued_at, valid_until::text as valid_until, scan_file_id,
    permitted_training_types, permitted_directions, status, notes,
    created_at, updated_at`;

  async list(tenantId: string, status?: LicenseStatus): Promise<TrainingLicense[]> {
    const rows = status
      ? await this.db.query<LicenseDbRow>(
          `select ${this.columns} from org.training_licenses
           where tenant_id = $1 and status = $2 order by created_at asc`,
          [tenantId, status]
        )
      : await this.db.query<LicenseDbRow>(
          `select ${this.columns} from org.training_licenses
           where tenant_id = $1 order by created_at asc`,
          [tenantId]
        );
    return rows.map((r) => this.map(r));
  }

  async getById(tenantId: string, id: string): Promise<TrainingLicense | null> {
    const rows = await this.db.query<LicenseDbRow>(
      `select ${this.columns} from org.training_licenses where tenant_id = $1 and id = $2`,
      [tenantId, id]
    );
    return rows[0] ? this.map(rows[0]) : null;
  }

  async findByTypeAndNumber(
    tenantId: string,
    licenseType: string,
    licenseNumber: string
  ): Promise<TrainingLicense | null> {
    const rows = await this.db.query<LicenseDbRow>(
      `select ${this.columns} from org.training_licenses
       where tenant_id = $1 and license_type = $2 and license_number = $3`,
      [tenantId, licenseType, licenseNumber]
    );
    return rows[0] ? this.map(rows[0]) : null;
  }

  async insert(license: TrainingLicense): Promise<TrainingLicense> {
    const rows = await this.db.query<LicenseDbRow>(
      `insert into org.training_licenses
         (id, tenant_id, license_type, license_number, issuer_name, issued_at, valid_until,
          scan_file_id, permitted_training_types, permitted_directions, status, notes,
          created_at, updated_at)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       returning ${this.columns}`,
      [
        license.id,
        license.tenantId,
        license.licenseType,
        license.licenseNumber,
        license.issuerName,
        license.issuedAt,
        license.validUntil ?? null,
        license.scanFileId ?? null,
        license.permittedTrainingTypes ?? null,
        license.permittedDirections ?? null,
        license.status,
        license.notes ?? null,
        license.createdAt,
        license.updatedAt
      ]
    );
    return this.map(rows[0]!);
  }

  async update(license: TrainingLicense): Promise<TrainingLicense> {
    const rows = await this.db.query<LicenseDbRow>(
      `update org.training_licenses set
         license_number = $3, issuer_name = $4, valid_until = $5, scan_file_id = $6,
         permitted_training_types = $7, permitted_directions = $8, status = $9, notes = $10,
         updated_at = $11
       where tenant_id = $1 and id = $2
       returning ${this.columns}`,
      [
        license.tenantId,
        license.id,
        license.licenseNumber,
        license.issuerName,
        license.validUntil ?? null,
        license.scanFileId ?? null,
        license.permittedTrainingTypes ?? null,
        license.permittedDirections ?? null,
        license.status,
        license.notes ?? null,
        license.updatedAt
      ]
    );
    return this.map(rows[0]!);
  }

  async findActiveExpiringBefore(
    tenantId: string,
    dateInclusive: string
  ): Promise<TrainingLicense[]> {
    const rows = await this.db.query<LicenseDbRow>(
      `select ${this.columns} from org.training_licenses
       where tenant_id = $1 and status = 'active'
         and valid_until is not null and valid_until <= $2::date
       order by valid_until asc`,
      [tenantId, dateInclusive]
    );
    return rows.map((r) => this.map(r));
  }

  private map(row: LicenseDbRow): TrainingLicense {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      licenseType: row.license_type as LicenseType,
      licenseNumber: row.license_number,
      issuerName: row.issuer_name,
      issuedAt: row.issued_at,
      ...(row.valid_until ? { validUntil: row.valid_until } : {}),
      ...(row.scan_file_id ? { scanFileId: row.scan_file_id } : {}),
      ...(row.permitted_training_types && row.permitted_training_types.length > 0
        ? { permittedTrainingTypes: row.permitted_training_types }
        : {}),
      ...(row.permitted_directions && row.permitted_directions.length > 0
        ? { permittedDirections: row.permitted_directions }
        : {}),
      status: row.status as LicenseStatus,
      ...(row.notes ? { notes: row.notes } : {}),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }
}
