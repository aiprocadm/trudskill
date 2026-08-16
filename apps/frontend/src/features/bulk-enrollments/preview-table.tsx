'use client';

import { DataTable, StatusChip } from '@trudskill/ui';

import type { ClassifiedParsedRow } from './types';
import type { Column } from '@trudskill/ui';

interface PreviewRow {
  rowNumber: number;
  fullName: string;
  email: string;
  snils: string;
  position: string;
  status: 'valid' | 'invalid';
  errorsText: string;
}

const columns: Column<PreviewRow>[] = [
  { key: 'rowNumber', title: '№' },
  { key: 'fullName', title: 'ФИО' },
  { key: 'email', title: 'Почта' },
  { key: 'snils', title: 'СНИЛС' },
  { key: 'position', title: 'Должность' },
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
        <StatusChip status="completed" label="Зачислим" />
      ) : (
        <StatusChip status="failed" label="Пропустим" />
      )
  },
  { key: 'errorsText', title: 'Что не так' }
];

export const PreviewTable = ({ rows }: { rows: ClassifiedParsedRow[] }) => {
  const previewRows: PreviewRow[] = rows.map((cr) => ({
    rowNumber: cr.row.rowNumber,
    fullName: cr.row.fullName,
    email: cr.row.email,
    snils: cr.row.snils ?? '',
    position: cr.row.position ?? '',
    status: cr.classification,
    errorsText: cr.errors.map((e) => e.message).join('; ')
  }));
  return <DataTable columns={columns} rows={previewRows} />;
};
