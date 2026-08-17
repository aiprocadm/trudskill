'use client';

import { DataTable, LoadingState, StatusChip } from '@trudskill/ui';

import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../components/state-wrappers';
import { usePortalDocuments, usePortalGroups, usePortalLearners } from '../mvp/hooks';
import { formatDate } from '../mvp/screen-helpers';

/*
 * Перенесён «как есть» из app/counterparty-portal/page.tsx (IA-001: экран не живёт
 * в page.tsx). ФТ-E5: данные приходят из /portal/* — сервер сам скоупит выдачу по
 * контрагенту представителя, поэтому здесь нет ни выбора компании, ни фильтров
 * «по всему центру»: представитель видит только своих сотрудников, их группы
 * и выданные документы.
 */
export function CounterpartyPortalScreen() {
  const learners = usePortalLearners({ page: 1, page_size: 20 });
  const groups = usePortalGroups({ page: 1, page_size: 20 });
  const documents = usePortalDocuments({ page: 1, page_size: 20 });

  return (
    <PageContainer>
      <PageHeader
        title="Портал заказчика"
        subtitle="Ваши сотрудники, группы обучения и выданные документы"
      />
      <SectionCard title="Мои сотрудники">
        {learners.loading ? <LoadingState message="Загружаем сотрудников…" /> : null}
        {learners.error ? <SectionError message={learners.error} /> : null}
        {learners.data?.items.length ? (
          <DataTable
            columns={[
              { key: 'lastName', title: 'Фамилия' },
              { key: 'firstName', title: 'Имя' },
              { key: 'email', title: 'Почта' },
              {
                key: 'status',
                title: 'Статус',
                render: (row) => <StatusChip status={row.status} />
              }
            ]}
            rows={learners.data.items}
          />
        ) : learners.loading ? null : (
          <SectionEmpty
            message="Сотрудники не найдены"
            hint="Здесь компания видит своих сотрудников, направленных на обучение."
          />
        )}
      </SectionCard>
      <SectionCard title="Группы обучения">
        {groups.loading ? <LoadingState message="Загружаем группы…" /> : null}
        {groups.error ? <SectionError message={groups.error} /> : null}
        {groups.data?.items.length ? (
          <DataTable
            columns={[
              { key: 'code', title: 'Группа' },
              { key: 'name', title: 'Название' },
              {
                key: 'status',
                title: 'Статус',
                render: (row) => <StatusChip status={row.status} />
              }
            ]}
            rows={groups.data.items}
          />
        ) : groups.loading ? null : (
          <SectionEmpty
            message="Группы не найдены"
            hint="Появятся учебные группы, в которых учатся сотрудники компании."
          />
        )}
      </SectionCard>
      <SectionCard title="Документы">
        {documents.loading ? <LoadingState message="Загружаем документы…" /> : null}
        {documents.error ? <SectionError message={documents.error} /> : null}
        {documents.data?.items.length ? (
          <DataTable
            columns={[
              { key: 'name', title: 'Документ' },
              { key: 'learnerName', title: 'Сотрудник' },
              { key: 'documentNumber', title: 'Номер' },
              {
                key: 'documentDate',
                title: 'Дата выдачи',
                render: (row) => formatDate(row.documentDate)
              },
              {
                key: 'validUntil',
                title: 'Действует до',
                render: (row) => formatDate(row.validUntil)
              },
              {
                key: 'status',
                title: 'Статус',
                render: (row) => <StatusChip status={row.status} />
              }
            ]}
            rows={documents.data.items}
          />
        ) : documents.loading ? null : (
          <SectionEmpty
            message="Документы не найдены"
            hint="Появятся удостоверения и протоколы сотрудников компании."
          />
        )}
      </SectionCard>
    </PageContainer>
  );
}
