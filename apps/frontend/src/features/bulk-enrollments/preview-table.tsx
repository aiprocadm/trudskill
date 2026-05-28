'use client';

import { DataTable } from '@cdoprof/ui';

import type { ClassifiedParsedRow } from './types';
import type { Column } from '@cdoprof/ui';

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
  { key: 'email', title: 'Email' },
  { key: 'snils', title: 'СНИЛС' },
  { key: 'position', title: 'Должность' },
  {
    key: 'status',
    title: 'Статус',
    render: (row) =>
      row.status === 'valid' ? (
        <span style={{ color: 'var(--ui-success-700, green)' }}>Валидно</span>
      ) : (
        <span style={{ color: 'var(--ui-error-700, red)' }}>Ошибка</span>
      )
  },
  { key: 'errorsText', title: 'Замечания' }
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
