'use client';

import { DataTable, FilterBar } from '@cdoprof/ui';
import { useMemo, useState } from 'react';

import { PageContainer, PageHeader, SectionCard } from '../../src/components/state-wrappers';
import {
  useAssignments,
  useCoursesList,
  useGroupsList,
  useQuestionBanks,
  useTests
} from '../../src/features/mvp/hooks';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

export default function ReportsPage() {
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const courses = useCoursesList({ page: 1, page_size: 1 });
  const groups = useGroupsList({ page: 1, page_size: 1 });
  const tests = useTests({ page: 1, page_size: 1 });
  const banks = useQuestionBanks({ page: 1, page_size: 1 });
  const assignments = useAssignments({ page: 1, page_size: 1 });
  const baseRows = [
    { report: 'Курсы', total: courses.data?.total ?? 0, export: 'CSV/XLSX' },
    { report: 'Группы', total: groups.data?.total ?? 0, export: 'CSV/XLSX' },
    { report: 'Тесты', total: tests.data?.total ?? 0, export: 'CSV/XLSX' },
    { report: 'Банки вопросов', total: banks.data?.total ?? 0, export: 'CSV/XLSX' },
    { report: 'Назначения', total: assignments.data?.total ?? 0, export: 'CSV/XLSX' }
  ];
  const reportRows = useMemo(
    () =>
      baseRows.filter((row) => {
        if (!status) return true;
        if (status === 'active') return row.total > 0;
        return row.total === 0;
      }),
    [baseRows, status]
  );

  const exportCsv = () => {
    const lines = ['report,total,from,to,status'];
    reportRows.forEach((row) =>
      lines.push(`${row.report},${row.total},${from || 'n/a'},${to || 'n/a'},${status || 'all'}`)
    );
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `reports_${Date.now()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader
          title="Отчётность"
          subtitle="П. 5.24 ТЗ — выгрузки по курсам, группам, экзаменам, НЭП, прокторингу"
          actions={
            <button type="button" className="ui-button ui-button--primary" onClick={exportCsv}>
              Выгрузить CSV
            </button>
          }
        />
        <SectionCard title="Параметры отчёта">
          <FilterBar>
            <label>
              С
              <input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            </label>
            <label>
              По
              <input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            </label>
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">Все</option>
              <option value="active">Только с данными</option>
              <option value="empty">Только пустые</option>
            </select>
          </FilterBar>
        </SectionCard>
        <SectionCard title="Операционные отчёты">
          <DataTable
            columns={[
              { key: 'report', title: 'Отчёт' },
              { key: 'total', title: 'Количество' },
              { key: 'export', title: 'Выгрузка' }
            ]}
            rows={reportRows}
          />
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
