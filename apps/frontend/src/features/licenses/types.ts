/**
 * Pillar A Plan C §5.10 — типы для UI лицензий учебного центра.
 *
 * Дублируем backend-union на фронте, чтобы получить compile-time проверки
 * на label-mappings и валидаторы форм. Если backend добавит новый license_type,
 * без правок здесь падает TypeScript на этапе билда.
 */

import type { SemanticStatus } from '@trudskill/ui';

export type LicenseType = 'education_license' | 'accreditation' | 'sro_membership' | 'other';

export type LicenseStatus = 'active' | 'expired' | 'revoked';

export const ALL_LICENSE_TYPES: LicenseType[] = [
  'education_license',
  'accreditation',
  'sro_membership',
  'other'
];

export const LICENSE_TYPE_LABELS: Record<LicenseType, string> = {
  education_license: 'Лицензия на образовательную деятельность',
  accreditation: 'Аккредитация',
  sro_membership: 'Членство в СРО',
  other: 'Другое'
};

export const ALL_LICENSE_STATUSES: LicenseStatus[] = ['active', 'expired', 'revoked'];

export const LICENSE_STATUS_LABELS: Record<LicenseStatus, string> = {
  active: 'Действует',
  expired: 'Истекла',
  revoked: 'Отозвана'
};

/**
 * Цвет чипа для статуса лицензии (`UI-023`).
 *
 * Палитра статусов общая на весь продукт (13 ключей, 5 цветов), доменных статусов
 * больше — поэтому сопоставление пишется явно. «Истекла» — предупреждение: документ
 * ещё вчера был в порядке, а сегодня работа встанет. «Отозвана» — отказ, обратной
 * дороги нет. До этого среза сюда по ошибке уходила готовая подпись, и все лицензии
 * в реестре красились одинаковым серым.
 */
export const LICENSE_STATUS_TONE: Record<LicenseStatus, SemanticStatus> = {
  active: 'active',
  expired: 'archived',
  revoked: 'cancelled'
};

export interface TrainingLicense {
  id: string;
  tenantId: string;
  licenseType: LicenseType;
  licenseNumber: string;
  issuerName: string;
  issuedAt: string;
  validUntil?: string;
  scanFileId?: string;
  permittedTrainingTypes?: string[];
  permittedDirections?: string[];
  status: LicenseStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateLicensePayload {
  licenseType: LicenseType;
  licenseNumber: string;
  issuerName: string;
  issuedAt: string;
  validUntil?: string;
  scanFileId?: string;
  permittedTrainingTypes?: string[];
  permittedDirections?: string[];
  notes?: string;
}

export interface UpdateLicensePayload {
  licenseNumber?: string;
  issuerName?: string;
  validUntil?: string;
  scanFileId?: string;
  permittedTrainingTypes?: string[];
  permittedDirections?: string[];
  notes?: string;
}

export interface LicensesListResponse {
  items: TrainingLicense[];
}
