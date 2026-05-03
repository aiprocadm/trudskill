'use client';

import { DataTable, FilterBar } from '@cdoprof/ui';
import { useMemo, useState } from 'react';

import { PageContainer, PageHeader, SectionCard } from '../../src/components/state-wrappers';
import { useAuth } from '../../src/features/auth/context';
import {
  useAssignments,
  useCoursesList,
  useEnrollments,
  useGroupsList,
  useKpiSnapshot,
  useLearnerCourses,
  useQuestionBanks,
  useTests
} from '../../src/features/mvp/hooks';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

import type { KpiFilterQuery } from '../../src/features/mvp/types';

export default function ReportsPage() {
  const { session } = useAuth();
  const [status, setStatus] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [kpiCourseId, setKpiCourseId] = useState('');
  const [kpiGroupId, setKpiGroupId] = useState('');
  const courses = useCoursesList({ page: 1, page_size: 1 });
  const groups = useGroupsList({ page: 1, page_size: 1 });
  const tests = useTests({ page: 1, page_size: 1 });
  const banks = useQuestionBanks({ page: 1, page_size: 1 });
  const assignments = useAssignments({ page: 1, page_size: 1 });
  const enrollments = useEnrollments({ page: 1, page_size: 200 });
  const learnerCourses = useLearnerCourses(session?.user.id ?? '');
  const kpiQuery: KpiFilterQuery = {
    ...(from ? { created_from: from } : {}),
    ...(to ? { created_to: to } : {}),
    ...(kpiCourseId.trim() ? { course_id: kpiCourseId.trim() } : {}),
    ...(kpiGroupId.trim() ? { group_id: kpiGroupId.trim() } : {})
  };
  const kpi = useKpiSnapshot(kpiQuery);
  const progressCounters = useMemo(() => {
    const items = enrollments.data?.items ?? [];
    return {
      pending: items.filter((item) => item.status === 'pending').length,
      active: items.filter((item) => item.status === 'active').length,
      completed: items.filter((item) => item.status === 'completed').length,
      suspended: items.filter((item) => item.status === 'suspended').length
    };
  }, [enrollments.data?.items]);
  const reportRows = useMemo(
    () =>
      [
        { report: 'Курсы', total: courses.data?.total ?? 0, export: 'CSV/XLSX' },
        { report: 'Группы', total: groups.data?.total ?? 0, export: 'CSV/XLSX' },
        { report: 'Тесты', total: tests.data?.total ?? 0, export: 'CSV/XLSX' },
        { report: 'Банки вопросов', total: banks.data?.total ?? 0, export: 'CSV/XLSX' },
        { report: 'Назначения', total: assignments.data?.total ?? 0, export: 'CSV/XLSX' }
      ].filter((row) => {
        if (!status) return true;
        if (status === 'active') return row.total > 0;
        return row.total === 0;
      }),
    [
      assignments.data?.total,
      banks.data?.total,
      courses.data?.total,
      groups.data?.total,
      status,
      tests.data?.total
    ]
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
            <label>
              KPI: курс (id)
              <input
                placeholder="course_id опционально"
                value={kpiCourseId}
                onChange={(event) => setKpiCourseId(event.target.value)}
              />
            </label>
            <label>
              KPI: группа (id)
              <input
                placeholder="group_id опционально"
                value={kpiGroupId}
                onChange={(event) => setKpiGroupId(event.target.value)}
              />
            </label>
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">Все</option>
              <option value="active">Только с данными</option>
              <option value="empty">Только пустые</option>
            </select>
          </FilterBar>
        </SectionCard>
        <SectionCard title="KPI обучения (BL-008)">
          {kpi.error ? (
            <p className="ui-text-muted">Не удалось загрузить KPI: {kpi.error}</p>
          ) : null}
          {kpi.loading ? <p className="ui-text-muted">Загрузка KPI…</p> : null}
          {!kpi.loading && !kpi.error && kpi.data ? (
            <dl className="ui-stack">
              <div>
                <dt>Назначения в фильтре</dt>
                <dd>
                  всего {kpi.data.enrollmentsTotal}, завершено {kpi.data.enrollmentsCompleted} (
                  {(kpi.data.enrollmentCompletionRate * 100).toFixed(1)} %)
                </dd>
              </div>
              <div>
                <dt>Экзамены в фильтре</dt>
                <dd>
                  итогов {kpi.data.examResultsInScopeTotal}, сдано {kpi.data.examResultsPassed} (
                  {(kpi.data.examPassRate * 100).toFixed(1)} %)
                </dd>
              </div>
            </dl>
          ) : null}
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
        <SectionCard title="Прогресс по обучению (роль + статусы)">
          <DataTable
            columns={[
              { key: 'role', title: 'Роль' },
              { key: 'assigned', title: 'Назначено' },
              { key: 'active', title: 'В процессе' },
              { key: 'completed', title: 'Завершено' },
              { key: 'suspended', title: 'Проблемные' }
            ]}
            rows={[
              {
                role: 'Слушатель',
                assigned: learnerCourses.data?.total ?? 0,
                active: progressCounters.active,
                completed: progressCounters.completed,
                suspended: progressCounters.suspended + progressCounters.pending
              }
            ]}
          />
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
