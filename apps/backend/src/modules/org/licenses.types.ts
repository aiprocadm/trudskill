/**
 * Pillar A Plan C §5.10 — лицензии и аккредитации учебного центра.
 *
 * Лицензия выдана внешним регулятором (Рособрнадзор, Минтруд, СРО);
 * центр публикует программу только если есть active matching license.
 */

export type LicenseType = 'education_license' | 'accreditation' | 'sro_membership' | 'other';

export type LicenseStatus = 'active' | 'expired' | 'revoked';

/**
 * `permittedTrainingTypes`: `null/undefined` означает «универсальная» — действует
 * для всех видов подготовки. Иначе — конкретный whitelist.
 *
 * `permittedDirections`: аналогично — `null/undefined` = «все направления».
 */
export interface TrainingLicense {
  id: string;
  tenantId: string;
  licenseType: LicenseType;
  licenseNumber: string;
  issuerName: string;
  issuedAt: string; // ISO date (YYYY-MM-DD)
  validUntil?: string; // ISO date; undefined = бессрочная.
  scanFileId?: string;
  permittedTrainingTypes?: string[];
  permittedDirections?: string[];
  status: LicenseStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
