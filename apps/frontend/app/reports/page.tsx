'use client';

import { DataTable } from '@cdoprof/ui';

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
  const courses = useCoursesList({ page: 1, page_size: 1 });
  const groups = useGroupsList({ page: 1, page_size: 1 });
  const tests = useTests({ page: 1, page_size: 1 });
  const banks = useQuestionBanks({ page: 1, page_size: 1 });
  const assignments = useAssignments({ page: 1, page_size: 1 });
  const reportRows = [
    { report: 'Курсы', total: courses.data?.total ?? 0, export: 'CSV/XLSX' },
    { report: 'Группы', total: groups.data?.total ?? 0, export: 'CSV/XLSX' },
    { report: 'Тесты', total: tests.data?.total ?? 0, export: 'CSV/XLSX' },
    { report: 'Банки вопросов', total: banks.data?.total ?? 0, export: 'CSV/XLSX' },
    { report: 'Назначения', total: assignments.data?.total ?? 0, export: 'CSV/XLSX' }
  ];

  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader
          title="Отчётность"
          subtitle="П. 5.24 ТЗ — выгрузки по курсам, группам, экзаменам, НЭП, прокторингу"
        />
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
