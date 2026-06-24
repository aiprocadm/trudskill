'use client';

import { DataTable, LoadingState } from '@cdoprof/ui';

import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../src/components/state-wrappers';
import { useCounterpartiesList, useEnrollments, useGroupsList } from '../../src/features/mvp/hooks';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

export default function CounterpartyPortalPage() {
  const counterparties = useCounterpartiesList({ page: 1, page_size: 20 });
  const groups = useGroupsList({ page: 1, page_size: 20 });
  const enrollments = useEnrollments({ page: 1, page_size: 20 });

  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader
          title="Кабинет контрагента (обзор для персонала)"
          subtitle="Отдельный контур для юрлица — навигация к его данным"
        />
        <SectionCard title="Контрагенты">
          {counterparties.loading ? <LoadingState message="Загрузка контрагентов..." /> : null}
          {counterparties.error ? <SectionError message={counterparties.error} /> : null}
          {counterparties.data?.items.length ? (
            <DataTable
              columns={[
                { key: 'code', title: 'Код' },
                { key: 'name', title: 'Название' },
                { key: 'status', title: 'Статус' }
              ]}
              rows={counterparties.data.items}
            />
          ) : (
            <SectionEmpty message="Контрагенты не найдены" />
          )}
        </SectionCard>
        <SectionCard title="Группы и зачисления">
          {groups.loading || enrollments.loading ? (
            <LoadingState message="Загрузка данных..." />
          ) : null}
          {groups.error ? <SectionError message={groups.error} /> : null}
          {enrollments.error ? <SectionError message={enrollments.error} /> : null}
          {groups.data?.items.length ? (
            <DataTable
              columns={[
                { key: 'code', title: 'Группа' },
                { key: 'name', title: 'Название' },
                { key: 'status', title: 'Статус' }
              ]}
              rows={groups.data.items}
            />
          ) : null}
          <p>Активных зачислений: {enrollments.data?.items.length ?? 0}</p>
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
