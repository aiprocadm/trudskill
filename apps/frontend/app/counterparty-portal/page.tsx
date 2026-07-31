'use client';

import { DataTable, LoadingState } from '@trudskill/ui';

import {
  PageContainer,
  PageHeader,
  SectionCard,
  SectionEmpty,
  SectionError
} from '../../src/components/state-wrappers';
import {
  usePortalDocuments,
  usePortalGroups,
  usePortalLearners
} from '../../src/features/mvp/hooks';
import { ProtectedPage } from '../../src/widgets/shell/protected-page';

// ФТ-E5 (Фаза 4 Task 1, срез 3): экран под правом portal.read. Данные приходят из
// /portal/* — сервер сам скоупит выдачу по контрагенту представителя, поэтому здесь
// нет ни выбора компании, ни фильтров «по всему центру»: представитель видит только
// своих сотрудников, их группы и выданные документы.
export default function CounterpartyPortalPage() {
  const learners = usePortalLearners({ page: 1, page_size: 20 });
  const groups = usePortalGroups({ page: 1, page_size: 20 });
  const documents = usePortalDocuments({ page: 1, page_size: 20 });

  return (
    <ProtectedPage>
      <PageContainer>
        <PageHeader
          title="Портал заказчика"
          subtitle="Ваши сотрудники, группы обучения и выданные документы"
        />
        <SectionCard title="Мои сотрудники">
          {learners.loading ? <LoadingState message="Загрузка сотрудников..." /> : null}
          {learners.error ? <SectionError message={learners.error} /> : null}
          {learners.data?.items.length ? (
            <DataTable
              columns={[
                { key: 'lastName', title: 'Фамилия' },
                { key: 'firstName', title: 'Имя' },
                { key: 'email', title: 'Email' },
                { key: 'status', title: 'Статус' }
              ]}
              rows={learners.data.items}
            />
          ) : learners.loading ? null : (
            <SectionEmpty message="Сотрудники не найдены" />
          )}
        </SectionCard>
        <SectionCard title="Группы обучения">
          {groups.loading ? <LoadingState message="Загрузка групп..." /> : null}
          {groups.error ? <SectionError message={groups.error} /> : null}
          {groups.data?.items.length ? (
            <DataTable
              columns={[
                { key: 'code', title: 'Группа' },
                { key: 'name', title: 'Название' },
                { key: 'status', title: 'Статус' }
              ]}
              rows={groups.data.items}
            />
          ) : groups.loading ? null : (
            <SectionEmpty message="Группы не найдены" />
          )}
        </SectionCard>
        <SectionCard title="Документы">
          {documents.loading ? <LoadingState message="Загрузка документов..." /> : null}
          {documents.error ? <SectionError message={documents.error} /> : null}
          {documents.data?.items.length ? (
            <DataTable
              columns={[
                { key: 'name', title: 'Документ' },
                { key: 'learnerName', title: 'Сотрудник' },
                { key: 'documentNumber', title: 'Номер' },
                { key: 'documentDate', title: 'Дата выдачи' },
                { key: 'validUntil', title: 'Действует до' },
                { key: 'status', title: 'Статус' }
              ]}
              rows={documents.data.items}
            />
          ) : documents.loading ? null : (
            <SectionEmpty message="Документы не найдены" />
          )}
        </SectionCard>
      </PageContainer>
    </ProtectedPage>
  );
}
