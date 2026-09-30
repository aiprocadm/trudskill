'use client';

import { useQuery } from '@tanstack/react-query';
import { DataTable, DetailDrawer, LoadingState } from '@trudskill/ui';
import { useState } from 'react';

import { dataImportApi } from './api';
import { ROW_FILTERS, domainLabel, rowResultLabel, rowSubject, runSummary } from './model';
import { SectionEmpty, SectionError } from '../../components/state-wrappers';
import { useAuth } from '../auth/context';

import type { ImportRunDto } from './api';
import type { RowFilterId } from './model';

const PAGE = 100;

/**
 * Отчёт запуска (срез 23.5): что с каждой записью прежней системы. Первым делом человеку нужны
 * ошибки и «похожие записи» — отборы стоят в этом порядке.
 */
export function ImportReportDrawer({ run, onClose }: { run: ImportRunDto; onClose: () => void }) {
  const { session } = useAuth();
  const [filter, setFilter] = useState<RowFilterId>(run.stats.failed > 0 ? 'failed' : 'all');
  const chosen = ROW_FILTERS.find((item) => item.id === filter) ?? ROW_FILTERS[0];
  const query = 'query' in chosen ? chosen.query : {};

  const rowsQuery = useQuery({
    queryKey: ['import-rows', run.id, filter],
    queryFn: () => dataImportApi.listImportRows(session!, run.id, { ...query, limit: PAGE }),
    enabled: Boolean(session),
    meta: { suppressGlobalErrorToast: true }
  });
  const rows = (rowsQuery.data?.items ?? []).map((row) => ({
    ...row,
    domainTitle: domainLabel(row.domain),
    subject: rowSubject(row),
    result: rowResultLabel(row, run.dryRun),
    explanation: row.errorText ?? ''
  }));
  const total = rowsQuery.data?.total ?? 0;

  return (
    <DetailDrawer
      open
      onClose={onClose}
      /* Отбор отчёта — не данные: закрыть панель ничего не теряет. */
      hasUnsavedChanges={false}
      width="lg"
      title={run.dryRun ? 'Отчёт проверки без переноса' : 'Отчёт переноса данных'}
      subtitle={runSummary(run)}
    >
      <div className="ui-stack">
        <label className="ui-field">
          <span className="ui-field-label">Показать</span>
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as RowFilterId)}
            style={{ maxWidth: '100%' }}
          >
            {ROW_FILTERS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        {rowsQuery.error ? <SectionError error={rowsQuery.error} /> : null}
        {rowsQuery.isLoading ? <LoadingState message="Загрузка отчёта…" /> : null}
        {!rowsQuery.isLoading && rows.length ? (
          <>
            <DataTable
              columns={[
                { key: 'domainTitle', title: 'Что' },
                { key: 'subject', title: 'Запись' },
                { key: 'result', title: 'Итог' },
                { key: 'explanation', title: 'Пояснение' }
              ]}
              rows={rows}
            />
            {total > rows.length ? (
              <p className="ui-hint">
                Показаны первые {rows.length} из {total}. Выберите отбор, чтобы увидеть нужные
                строки.
              </p>
            ) : null}
          </>
        ) : null}
        {!rowsQuery.isLoading && !rows.length && !rowsQuery.error ? (
          <SectionEmpty
            message="В этом отборе строк нет"
            hint="Выберите другой отбор: например, «Все строки», чтобы увидеть весь отчёт."
          />
        ) : null}
      </div>
    </DetailDrawer>
  );
}
