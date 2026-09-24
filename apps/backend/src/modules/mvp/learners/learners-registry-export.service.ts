import { Injectable } from '@nestjs/common';

import { ReportXlsxWriter } from '../report-builder/report-xlsx.writer.js';

import type { LearnerRegistryRow } from '../infrastructure/repositories/learners-registry.js';
import type { ReportCellValue, ReportColumn } from '../report-builder/report-types.js';

export const LEARNERS_XLSX_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Колонки выгрузки — русские подписи без идентификаторов (МГ-H1: «заголовки — подписи, без id»). */
export const LEARNERS_EXPORT_COLUMNS: ReportColumn[] = [
  { key: 'fullName', header: 'ФИО', type: 'string' },
  { key: 'email', header: 'Почта', type: 'string' },
  { key: 'snils', header: 'СНИЛС', type: 'string' },
  { key: 'position', header: 'Должность', type: 'string' },
  { key: 'company', header: 'Компания', type: 'string' },
  { key: 'group', header: 'Группа (текущая)', type: 'string' },
  { key: 'lastLoginAt', header: 'Последний вход', type: 'date' },
  { key: 'consent', header: 'Согласие ПДн', type: 'string' },
  { key: 'status', header: 'Статус', type: 'string' }
];

const STATUS_LABEL: Record<string, string> = { active: 'Активен', archived: 'В архиве' };

const dateOnly = (iso: string | undefined): string | null =>
  iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : null;

/** Строка выгрузки из строки реестра; СНИЛС приходит уже маской (`learners.read`). */
export const learnerExportRow = (row: LearnerRegistryRow): Record<string, ReportCellValue> => ({
  fullName: [row.lastName, row.firstName, row.middleName].filter(Boolean).join(' '),
  email: row.email ?? null,
  snils: row.snils ?? null,
  position: row.position ?? null,
  company: row.registry?.companyName ?? null,
  group: row.registry?.currentGroupName ?? null,
  lastLoginAt: dateOnly(row.registry?.lastLoginAt),
  consent:
    row.registry?.consentGranted === undefined
      ? null
      : row.registry.consentGranted
        ? 'действует'
        : 'нет',
  status: STATUS_LABEL[row.status] ?? row.status
});

/**
 * Выгрузка реестра слушателей в XLSX (МГ-C3.2, срез 11.1, РМ105): те же фильтры, что на экране,
 * подписи вместо кодов, СНИЛС маской — файл уходит под тем же правом, что и список.
 */
@Injectable()
export class LearnersRegistryExportService {
  private readonly writer = new ReportXlsxWriter();

  async build(rows: LearnerRegistryRow[]): Promise<Buffer> {
    return this.writer.build(LEARNERS_EXPORT_COLUMNS, rows.map(learnerExportRow));
  }
}
