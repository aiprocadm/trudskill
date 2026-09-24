'use client';

import { DataTable, StatusChip } from '@trudskill/ui';

import { composeFullName, profileSummary } from './import-fields';

import type { ClassifiedParsedRow } from './types';
import type { Column } from '@trudskill/ui';

interface PreviewRow {
  rowNumber: number;
  fullName: string;
  email: string;
  snils: string;
  profile: string;
  status: 'valid' | 'invalid';
  errorsText: string;
}

/*
 * Семь колонок (§13.2): с МГ-C3.1 (срез 10.2) вместо «Должность» — сводка личного дела:
 * должность, дата рождения, пол, телефон, паспорт, гражданство, образование, ИНН компании —
 * что заполнено, тем и подписано. Отдельная колонка на каждое поле дала бы пятнадцать.
 */
const columns: Column<PreviewRow>[] = [
  { key: 'rowNumber', title: '№' },
  { key: 'fullName', title: 'ФИО' },
  { key: 'email', title: 'Почта' },
  { key: 'snils', title: 'СНИЛС' },
  { key: 'profile', title: 'Личное дело' },
  {
    key: 'status',
    title: 'Что будет со строкой',
    /*
     * Цвет брался из `--ui-success-700` и `--ui-error-700` — таких переменных в палитре нет
     * НИКОГДА не было, поэтому браузер молча подставлял запасные `green`/`red` мимо палитры
     * (и мимо контраста в тёмной теме). Бейдж берёт цвет из токенов и, главное, называет
     * последствие: человеку важно не «валидно», а «зачислим / не зачислим».
     */
    render: (row) =>
      row.status === 'valid' ? (
        <StatusChip status="completed" label="Примем" />
      ) : (
        <StatusChip status="failed" label="Пропустим" />
      )
  },
  { key: 'errorsText', title: 'Что не так' }
];

export const PreviewTable = ({ rows }: { rows: ClassifiedParsedRow[] }) => {
  const previewRows: PreviewRow[] = rows.map((cr) => ({
    rowNumber: cr.row.rowNumber,
    fullName: composeFullName(cr.row),
    email: cr.row.email,
    snils: cr.row.snils ?? '',
    profile: profileSummary(cr.row) || '—',
    status: cr.classification,
    errorsText: cr.errors.map((e) => e.message).join('; ')
  }));
  return <DataTable columns={columns} rows={previewRows} />;
};
